import { createHash } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import multer from "multer";
import { z } from "zod";
import {
  MAX_THEME_IMAGE_BYTES,
  normalizeThemeImage,
} from "../lib/themeImageValidation";
import {
  themeImageStorage,
  type ThemeImageObject,
  type ThemeImageStorage,
} from "../lib/themeImageStorage";

const eventIdSchema = z.string().uuid();
const imageIdSchema = z.string().uuid();
const modes = ["studio", "editorial", "signature"] as const;

const themeInput = z
  .object({
    mode: z.enum(modes),
    imageId: imageIdSchema.nullable(),
    focalX: z.number().finite().min(0).max(100),
    focalY: z.number().finite().min(0).max(100),
    overlay: z.number().finite().min(0).max(1),
    guestImageConsent: z.boolean(),
    revision: z.number().int().min(1),
  })
  .strict();

type EventThemeInput = z.infer<typeof themeInput>;

const imageMimes = new Set(["image/jpeg", "image/png", "image/webp"]);
const themeImageBody = express.raw({
  limit: MAX_THEME_IMAGE_BYTES,
  type: (request) => {
    const contentType = request.headers["content-type"]?.split(";", 1)[0];
    return Boolean(contentType && imageMimes.has(contentType.toLowerCase()));
  },
});
const multipartThemeImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_THEME_IMAGE_BYTES, files: 1, fields: 0, parts: 1 },
}).single("image");

type OwnerResolver = (request: Request) => Promise<string | null> | string | null;

export interface EventThemeRouterOptions {
  /**
   * Integration tests can inject a DB-backed Clerk identity without changing
   * production authorization. The default always resolves from Clerk.
   */
  resolveOwner?: OwnerResolver;
  storage?: ThemeImageStorage;
}

class ThemeConflictError extends Error {
  constructor() {
    super("Le thème a été modifié ailleurs. Actualisez-le.");
    this.name = "ThemeConflictError";
  }
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function ownerFromClerk(request: Request): string | null {
  const auth = getAuth(request);
  const ownerId = auth?.sessionClaims?.userId || auth?.userId;
  return typeof ownerId === "string" ? ownerId : null;
}

function ownerImageUrl(eventId: string, imageId: string) {
  return `/api/events/${eventId}/theme/images/${imageId}`;
}

function guestImageUrl(token: string) {
  return `/api/guest/${encodeURIComponent(token)}/theme/image`;
}

function mapTheme(
  row: {
    event_id: string;
    mode: string;
    image_id: string | null;
    focal_x: number;
    focal_y: number;
    overlay: number;
    guest_image_consent: boolean;
    revision: number;
  },
  imageUrl: string | null,
) {
  return {
    mode: row.mode,
    imageId: row.image_id,
    imageUrl,
    focalX: Number(row.focal_x),
    focalY: Number(row.focal_y),
    overlay: Number(row.overlay),
    guestImageConsent: row.guest_image_consent,
    revision: row.revision,
  };
}

async function assertOwnedEvent(ownerId: string, eventId: string) {
  const event = await pool.query(
    "SELECT id FROM sillage_events WHERE id = $1 AND owner_id = $2",
    [eventId, ownerId],
  );
  if (!event.rowCount) throw new Error("Événement introuvable.");
}

async function ensureTheme(eventId: string) {
  await pool.query(
    `INSERT INTO sillage_event_themes (event_id)
     VALUES ($1)
     ON CONFLICT (event_id) DO NOTHING`,
    [eventId],
  );
}

async function readOwnerTheme(eventId: string) {
  await ensureTheme(eventId);
  const result = await pool.query(
    `SELECT event_id, mode, image_id, focal_x, focal_y, overlay,
            guest_image_consent, revision
       FROM sillage_event_themes
      WHERE event_id = $1`,
    [eventId],
  );
  return result.rows[0];
}

async function readGuestTheme(eventId: string) {
  const result = await pool.query(
    `SELECT event_id, mode,
            CASE WHEN guest_image_consent THEN image_id ELSE NULL END AS image_id,
            focal_x, focal_y, overlay,
            CASE WHEN guest_image_consent AND image_id IS NOT NULL
                 THEN true ELSE false END AS guest_image_consent,
            revision
       FROM sillage_event_themes
      WHERE event_id = $1`,
    [eventId],
  );
  return (
    result.rows[0] ?? {
      event_id: eventId,
      mode: "studio",
      image_id: null,
      focal_x: 50,
      focal_y: 50,
      overlay: 0.5,
      guest_image_consent: false,
      revision: 1,
    }
  );
}

async function activeGuestEvent(token: string) {
  const result = await pool.query(
    `SELECT e.id
       FROM sillage_shares s
       JOIN sillage_events e ON e.id = s.event_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL`,
    [hash(token)],
  );
  if (!result.rowCount) {
    throw new Error("Ce lien invité est invalide ou a été révoqué.");
  }
  return result.rows[0] as { id: string };
}

function sendThemeError(response: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Erreur serveur.";
  if (error instanceof ThemeConflictError) {
    return response.status(409).json({ error: message });
  }
  if (/authentification/i.test(message)) {
    return response.status(401).json({ error: message });
  }
  if (/introuvable|révoqué|not found|no such object/i.test(message)) {
    return response.status(404).json({ error: message });
  }
  if (
    /invalide|refusé|correspond|volumineuse|dimensions|format|MIME|traiter|vide|appartient|configuration/i.test(
      message,
    )
  ) {
    return response.status(400).json({ error: message });
  }
  return response.status(500).json({ error: message });
}

function rawThemeImage(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  themeImageBody(request, response, (error) => {
    if (!error) return next();
    if ((error as { type?: string }).type === "entity.too.large") {
      return response
        .status(413)
        .json({ error: "Image de thème trop volumineuse (8 Mo maximum)." });
    }
    return response.status(400).json({ error: "Corps d’image invalide." });
  });
}

function parseThemeImageBody(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const contentType = request.headers["content-type"]?.toLowerCase() ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    return rawThemeImage(request, response, next);
  }
  return multipartThemeImage(request, response, (error) => {
    if (!error) return next();
    if ((error as { code?: string }).code === "LIMIT_FILE_SIZE") {
      return response
        .status(413)
        .json({ error: "Image de thème trop volumineuse (8 Mo maximum)." });
    }
    return response.status(400).json({
      error: "Envoyez un seul fichier image dans le champ image.",
    });
  });
}

function sendImage(
  response: Response,
  image: ThemeImageObject,
): void {
  response.setHeader("Cache-Control", "private, no-store");
  // Uploaded bytes are always normalized to WebP. Do not trust object
  // metadata as a browser MIME type if an object is modified out of band.
  response.setHeader(
    "Content-Type",
    image.contentType === "image/webp" ? "image/webp" : "application/octet-stream",
  );
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Length", image.size);
  image.stream.on("error", () => response.destroy());
  image.stream.pipe(response);
}

export function createEventThemeRouter(
  options: EventThemeRouterOptions = {},
) {
  const router = express.Router();
  const resolveOwner = options.resolveOwner ?? ownerFromClerk;
  const storage = options.storage ?? themeImageStorage;

  const owner = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const ownerId = await resolveOwner(request);
      if (!ownerId) {
        return response
          .status(401)
          .json({ error: "Authentification requise." });
      }
      (request as Request & { ownerId: string }).ownerId = ownerId;
      return next();
    } catch (error) {
      return sendThemeError(response, error);
    }
  };

  router.get(
    "/events/:eventId/theme",
    owner,
    async (request: Request & { ownerId?: string }, response: Response) => {
      const parsedEventId = eventIdSchema.safeParse(request.params.eventId);
      if (!parsedEventId.success) {
        return response.status(400).json({ error: "Événement invalide." });
      }
      try {
        await assertOwnedEvent(request.ownerId!, parsedEventId.data);
        const row = await readOwnerTheme(parsedEventId.data);
        const imageUrl = row.image_id
          ? ownerImageUrl(parsedEventId.data, row.image_id)
          : null;
        return response.json(mapTheme(row, imageUrl));
      } catch (error) {
        return sendThemeError(response, error);
      }
    },
  );

  router.put(
    "/events/:eventId/theme",
    owner,
    async (request: Request & { ownerId?: string }, response: Response) => {
      const parsedEventId = eventIdSchema.safeParse(request.params.eventId);
      const parsed = themeInput.safeParse(request.body);
      if (!parsedEventId.success || !parsed.success) {
        return response.status(400).json({ error: "Thème invalide." });
      }

      try {
        const eventId = parsedEventId.data;
        const input: EventThemeInput = parsed.data;
        await assertOwnedEvent(request.ownerId!, eventId);
        await ensureTheme(eventId);

        const selectedImageId = input.imageId;
        if (selectedImageId) {
          const image = await pool.query(
            `SELECT id
               FROM sillage_theme_images
              WHERE id = $1 AND event_id = $2 AND owner_id = $3`,
            [selectedImageId, eventId, request.ownerId],
          );
          if (!image.rowCount) {
            return response
              .status(400)
              .json({ error: "Cette image n’appartient pas à l’événement." });
          }
        }

        const result = await pool.query(
          `UPDATE sillage_event_themes
              SET mode = $1,
                  image_id = $2,
                  focal_x = $3,
                  focal_y = $4,
                  overlay = $5,
                  guest_image_consent = $6,
                  revision = revision + 1,
                  updated_at = now()
            WHERE event_id = $7
              AND revision = $8
            RETURNING event_id, mode, image_id, focal_x, focal_y, overlay,
                      guest_image_consent, revision`,
          [
            input.mode,
            selectedImageId,
            input.focalX,
            input.focalY,
            input.overlay,
            selectedImageId ? input.guestImageConsent : false,
            eventId,
            input.revision,
          ],
        );
        if (!result.rowCount) throw new ThemeConflictError();
        const row = result.rows[0];
        return response.json(
          mapTheme(
            row,
            row.image_id ? ownerImageUrl(eventId, row.image_id) : null,
          ),
        );
      } catch (error) {
        return sendThemeError(response, error);
      }
    },
  );

  router.post(
    "/events/:eventId/theme/images",
    owner,
    parseThemeImageBody,
    async (request: Request & { ownerId?: string }, response: Response) => {
      const parsedEventId = eventIdSchema.safeParse(request.params.eventId);
      if (!parsedEventId.success) {
        return response.status(400).json({ error: "Événement invalide." });
      }
      const multipartFile = (
        request as Request & {
          file?: { buffer: Buffer; mimetype: string };
        }
      ).file;
      const contentType = (multipartFile?.mimetype ??
        request.headers["content-type"])
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (!contentType || !imageMimes.has(contentType)) {
        return response
          .status(400)
          .json({ error: "Format d’image refusé. Utilisez JPEG, PNG ou WebP." });
      }
      const imageBytes = multipartFile?.buffer ?? request.body;
      if (!Buffer.isBuffer(imageBytes)) {
        return response
          .status(400)
          .json({ error: "Envoyez l’image comme corps binaire." });
      }

      try {
        const eventId = parsedEventId.data;
        await assertOwnedEvent(request.ownerId!, eventId);
        const normalized = await normalizeThemeImage(imageBytes, contentType);
        const stored = await storage.put(normalized.bytes, normalized.mimeType);
        try {
          await pool.query(
            `INSERT INTO sillage_theme_images
              (id, event_id, owner_id, object_path, mime_type, byte_size, width, height)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              stored.imageId,
              eventId,
              request.ownerId,
              stored.objectPath,
              normalized.mimeType,
              normalized.bytes.length,
              normalized.width,
              normalized.height,
            ],
          );
        } catch (error) {
          await storage.remove(stored.objectPath).catch(() => undefined);
          throw error;
        }
        return response.status(201).json({
          imageId: stored.imageId,
          imageUrl: ownerImageUrl(eventId, stored.imageId),
        });
      } catch (error) {
        return sendThemeError(response, error);
      }
    },
  );

  router.get(
    "/events/:eventId/theme/images/:imageId",
    owner,
    async (request: Request & { ownerId?: string }, response: Response) => {
      const parsedEventId = eventIdSchema.safeParse(request.params.eventId);
      const parsedImageId = imageIdSchema.safeParse(request.params.imageId);
      if (!parsedEventId.success || !parsedImageId.success) {
        return response.status(400).json({ error: "Image invalide." });
      }
      try {
        await assertOwnedEvent(request.ownerId!, parsedEventId.data);
        const result = await pool.query(
          `SELECT object_path
             FROM sillage_theme_images
            WHERE id = $1 AND event_id = $2 AND owner_id = $3`,
          [parsedImageId.data, parsedEventId.data, request.ownerId],
        );
        if (!result.rowCount) throw new Error("Image de thème introuvable.");
        const image = await storage.open(result.rows[0].object_path);
        return sendImage(response, image);
      } catch (error) {
        return sendThemeError(response, error);
      }
    },
  );

  router.delete(
    "/events/:eventId/theme/images/:imageId",
    owner,
    async (request: Request & { ownerId?: string }, response: Response) => {
      const parsedEventId = eventIdSchema.safeParse(request.params.eventId);
      const parsedImageId = imageIdSchema.safeParse(request.params.imageId);
      if (!parsedEventId.success || !parsedImageId.success) {
        return response.status(400).json({ error: "Image invalide." });
      }
      const client = await pool.connect();
      try {
        await assertOwnedEvent(request.ownerId!, parsedEventId.data);
        await client.query("BEGIN");
        const theme = await client.query(
          `SELECT image_id
             FROM sillage_event_themes
            WHERE event_id = $1
            FOR UPDATE`,
          [parsedEventId.data],
        );
        if (theme.rows[0]?.image_id === parsedImageId.data) {
          await client.query("ROLLBACK");
          return response.status(409).json({
            error: "Impossible de supprimer l’image actuellement sélectionnée.",
          });
        }
        const image = await client.query(
          `SELECT object_path
             FROM sillage_theme_images
            WHERE id = $1 AND event_id = $2 AND owner_id = $3
            FOR UPDATE`,
          [parsedImageId.data, parsedEventId.data, request.ownerId],
        );
        if (!image.rowCount) {
          await client.query("ROLLBACK");
          return response.status(404).json({ error: "Image de thème introuvable." });
        }
        await storage.remove(image.rows[0].object_path);
        await client.query("DELETE FROM sillage_theme_images WHERE id = $1", [
          parsedImageId.data,
        ]);
        await client.query("COMMIT");
        return response.status(204).end();
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        return sendThemeError(response, error);
      } finally {
        client.release();
      }
    },
  );

  router.get(
    "/guest/:token/theme",
    async (request: Request, response: Response) => {
      try {
        const token = request.params.token;
        if (typeof token !== "string") {
          return response.status(404).json({ error: "Lien invité invalide." });
        }
        const event = await activeGuestEvent(token);
        const row = await readGuestTheme(event.id);
        const imageUrl =
          row.guest_image_consent && row.image_id
            ? guestImageUrl(token)
            : null;
        response.setHeader("Cache-Control", "private, no-store");
        return response.json(mapTheme(row, imageUrl));
      } catch (error) {
        return sendThemeError(response, error);
      }
    },
  );

  router.get(
    "/guest/:token/theme/image",
    async (request: Request, response: Response) => {
      try {
        const token = request.params.token;
        if (typeof token !== "string") {
          return response.status(404).json({ error: "Lien invité invalide." });
        }
        const event = await activeGuestEvent(token);
        const result = await pool.query(
          `SELECT i.object_path
             FROM sillage_event_themes t
             JOIN sillage_theme_images i
               ON i.id = t.image_id AND i.event_id = t.event_id
            WHERE t.event_id = $1
              AND t.guest_image_consent = true
              AND t.image_id IS NOT NULL`,
          [event.id],
        );
        if (!result.rowCount) throw new Error("Image de thème introuvable.");
        const image = await storage.open(result.rows[0].object_path);
        return sendImage(response, image);
      } catch (error) {
        return sendThemeError(response, error);
      }
    },
  );

  return router;
}

export default createEventThemeRouter();
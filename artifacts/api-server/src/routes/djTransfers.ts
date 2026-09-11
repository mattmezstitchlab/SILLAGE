import { clerkClient, getAuth } from "@clerk/express";
import { Router, type Request, type Response, type NextFunction } from "express";
import { pool } from "@workspace/db";
import { z } from "zod";
import { openPrivateAudioDownload } from "../lib/audioStorage";

const MAX_TRANSFER_DAYS = 90;
const MAX_TRANSFER_TRACKS = 500;
const DJ_TRANSFER_PATH = "/api/dj-transfers";

type Database = typeof pool;
type DownloadSource = Awaited<ReturnType<typeof openPrivateAudioDownload>>;

export interface DjIdentity {
  userId: string;
  verifiedEmail: string;
}

export interface DjTransferRouterDependencies {
  /**
   * Injectable for authorization integration tests. Production uses
   * getAuth(req) for the identity and Clerk's backend user API for email
   * verification; request body/query email values are never used as identity.
   */
  resolveIdentity?: (req: Request) => Promise<DjIdentity | null>;
  db?: Database;
  openDownload?: (objectPath: string) => Promise<DownloadSource>;
}

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function canonicalEmail(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

/**
 * Clerk session claims are intentionally read with the same userId override
 * used by the existing owner routes. The email is then resolved from Clerk's
 * backend API, so a stale or forged client claim cannot bind a grant.
 */
async function resolveClerkIdentity(req: Request): Promise<DjIdentity | null> {
  const auth = getAuth(req);
  const claims = auth?.sessionClaims as { userId?: string } | undefined;
  const userId = claims?.userId ?? auth?.userId;
  if (!userId) return null;

  const user = await clerkClient.users.getUser(userId);
  const addresses = (user.emailAddresses ?? []) as Array<{
    id?: string;
    emailAddress?: string;
    verification?: { status?: string } | null;
  }>;
  const primary = addresses.find(
    (address) =>
      address.id === user.primaryEmailAddressId &&
      address.verification?.status === "verified" &&
      typeof address.emailAddress === "string",
  );
  const verified =
    primary ??
    addresses.find(
      (address) =>
        address.verification?.status === "verified" &&
        typeof address.emailAddress === "string",
    );
  if (!verified?.emailAddress) return null;

  return {
    userId,
    verifiedEmail: canonicalEmail(verified.emailAddress),
  };
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Le transfert DJ est temporairement indisponible." });
}

function identityMiddleware(
  resolveIdentity: (req: Request) => Promise<DjIdentity | null>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void resolveIdentity(req)
      .then((identity) => {
        if (!identity) {
          res.status(401).json({ error: "Authentification avec une adresse vérifiée requise." });
          return;
        }
        (req as Request & { djIdentity: DjIdentity }).djIdentity = identity;
        next();
      })
      .catch(() => {
        res.status(401).json({ error: "Impossible de vérifier l'identité Clerk." });
      });
  };
}

function getIdentity(req: Request): DjIdentity {
  return (req as Request & { djIdentity: DjIdentity }).djIdentity;
}

function requireUuid(value: string, label: string): string {
  if (!z.string().uuid().safeParse(value).success) {
    throw new HttpError(400, `${label} invalide.`);
  }
  return value;
}

function routeParam(value: string | string[]): string {
  return typeof value === "string" ? value : value[0] ?? "";
}

function transferStatus(row: {
  revoked_at: Date | string | null;
  expires_at: Date | string;
  recipient_user_id: string | null;
}): "pending" | "active" | "expired" | "revoked" {
  if (row.revoked_at) return "revoked";
  if (new Date(row.expires_at).getTime() <= Date.now()) return "expired";
  return row.recipient_user_id ? "active" : "pending";
}

function transferUrl(id: string): string {
  // This is a copyable application URL, not an object-storage or signed URL.
  return `/dj-transfers/${id}`;
}

function downloadUrl(transferId: string, trackId: string): string {
  return `${DJ_TRANSFER_PATH}/${transferId}/tracks/${trackId}/download`;
}

type TransferTrackRow = {
  transfer_id: string;
  track_id: string;
  title_snapshot: string;
  artist_snapshot: string;
  album_snapshot: string;
  position: number;
  mime_type_snapshot: string;
  byte_size_snapshot: number;
};

type TransferHistoryRow = {
  id: string;
  transfer_id: string;
  track_id: string | null;
  title_snapshot: string | null;
  user_id: string | null;
  status: "initiated" | "served" | "failed" | "aborted";
  initiated_at: Date | string;
  completed_at: Date | string | null;
};

function mapTrack(row: TransferTrackRow, transferId: string) {
  return {
    id: row.track_id,
    title: row.title_snapshot,
    artist: row.artist_snapshot,
    album: row.album_snapshot,
    mimeType: row.mime_type_snapshot,
    byteSize: row.byte_size_snapshot,
    downloadUrl: downloadUrl(transferId, row.track_id),
  };
}

function mapHistory(row: TransferHistoryRow) {
  return {
    id: row.id,
    trackId: row.track_id,
    titleSnapshot: row.title_snapshot,
    status: row.status,
    djUserId: row.user_id,
    startedAt: row.initiated_at,
    completedAt: row.completed_at,
  };
}

function mapTransfer(
  row: {
    id: string;
    event_id: string;
    event_name_snapshot: string;
    recipient_email: string;
    recipient_user_id: string | null;
    bound_at: Date | string | null;
    rights_confirmed_at: Date | string;
    expires_at: Date | string;
    revoked_at: Date | string | null;
    created_at: Date | string;
  },
  tracks: TransferTrackRow[],
  history?: TransferHistoryRow[],
) {
  const transfer = {
    id: row.id,
    eventId: row.event_id,
    eventName: row.event_name_snapshot,
    url: transferUrl(row.id),
    recipientEmail: row.recipient_email,
    recipientUserId: row.recipient_user_id,
    boundAt: row.bound_at,
    rightsConfirmedAt: row.rights_confirmed_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    status: transferStatus(row),
    tracks: [...tracks]
      .sort((left, right) => left.position - right.position)
      .map((track) => mapTrack(track, row.id)),
  };
  return history ? { ...transfer, history: history.map(mapHistory) } : transfer;
}

async function transferTracks(database: Database, transferId: string): Promise<TransferTrackRow[]> {
  const result = await database.query<TransferTrackRow>(
    `SELECT transfer_id, track_id, title_snapshot, artist_snapshot, album_snapshot,
            mime_type_snapshot, byte_size_snapshot, position
       FROM sillage_dj_transfer_tracks
      WHERE transfer_id = $1
      ORDER BY position, track_id`,
    [transferId],
  );
  return result.rows;
}

async function transferHistory(
  database: Database,
  transferId: string,
): Promise<TransferHistoryRow[]> {
  const result = await database.query<TransferHistoryRow>(
    `SELECT id, transfer_id, track_id, title_snapshot, user_id, status,
            initiated_at, completed_at
       FROM sillage_dj_transfer_attempts
      WHERE transfer_id = $1
      ORDER BY initiated_at DESC, id DESC`,
    [transferId],
  );
  return result.rows;
}

async function transferWithTracks(database: Database, transferId: string) {
  const result = await database.query(
    `SELECT id, event_id, event_name_snapshot, recipient_email, recipient_user_id,
            bound_at, rights_confirmed_at, expires_at, revoked_at, created_at
       FROM sillage_dj_transfers
      WHERE id = $1`,
    [transferId],
  );
  if (!result.rowCount) {
    throw new HttpError(404, "Transfert DJ introuvable.");
  }
  return mapTransfer(result.rows[0], await transferTracks(database, transferId));
}

async function recordFailedAttempt(
  database: Database,
  context: {
    transferId: string;
    trackId?: string;
    title?: string;
    userId?: string;
    recipientEmail?: string;
    reason: string;
  },
): Promise<void> {
  await database.query(
    `INSERT INTO sillage_dj_transfer_attempts
      (transfer_id, track_id, title_snapshot, user_id, recipient_email, status,
       failure_reason, bytes_transferred, server_transfer_completed, completed_at)
     VALUES ($1, $2, $3, $4, $5, 'failed', $6, 0, false, now())`,
    [
      context.transferId,
      context.trackId ?? null,
      context.title ?? null,
      context.userId ?? null,
      context.recipientEmail ?? null,
      context.reason.slice(0, 500),
    ],
  );
}

function extensionForMime(contentType: string): string {
  const mime = contentType.toLowerCase().split(";", 1)[0].trim();
  const extensions: Record<string, string> = {
    "audio/aac": ".aac",
    "audio/flac": ".flac",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
    "audio/x-wav": ".wav",
  };
  return extensions[mime] ?? ".bin";
}

function contentDisposition(title: string, contentType: string): string {
  const extension = extensionForMime(contentType);
  const cleanTitle =
    title
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[\\/:*?"<>|]/g, "-")
      .trim()
      .slice(0, 120) || "audio";
  const unicodeName = `${cleanTitle}${extension}`;
  const asciiName =
    unicodeName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\;]/g, "_")
      .trim() || `audio${extension}`;
  const encoded = encodeURIComponent(unicodeName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`;
}

async function pipeDownload(
  req: Request,
  res: Response,
  source: DownloadSource,
): Promise<{ status: "served" | "failed" | "aborted"; bytes: number; reason?: string }> {
  let bytes = 0;
  return new Promise((resolve) => {
    let settled = false;
    let responseFinished = false;
    const finish = (
      status: "served" | "failed" | "aborted",
      reason?: string,
    ) => {
      if (settled) return;
      settled = true;
      resolve({ status, bytes, reason });
    };
    const cancelSource = () => {
      try {
        source.cancel();
      } catch {
        // The response outcome is determined by the request/stream events.
      }
    };

    source.stream.on("data", (chunk: Buffer | string) => {
      bytes += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
    });
    source.stream.once("end", () => {
      if (bytes !== source.size) {
        finish("failed", "incomplete storage stream");
        cancelSource();
        res.destroy();
      }
    });
    source.stream.once("error", (error: Error) => {
      finish("failed", error.message);
      cancelSource();
      if (!res.writableEnded) res.destroy();
    });
    req.once("aborted", () => {
      cancelSource();
      finish("aborted", "client disconnected");
    });
    res.once("finish", () => {
      responseFinished = true;
      if (bytes === source.size) {
        finish("served");
      } else {
        finish("failed", "response finished with incomplete storage stream");
      }
    });
    res.once("close", () => {
      if (!responseFinished) {
        cancelSource();
        finish("aborted", "client disconnected");
      }
    });
    res.once("error", (error: Error) => {
      cancelSource();
      finish("failed", error.message);
    });
    source.stream.pipe(res);
  });
}

export function createDjTransfersRouter(
  dependencies: DjTransferRouterDependencies = {},
): Router {
  const database = dependencies.db ?? pool;
  const resolveIdentity = dependencies.resolveIdentity ?? resolveClerkIdentity;
  const openDownload = dependencies.openDownload ?? openPrivateAudioDownload;
  const authenticated = identityMiddleware(resolveIdentity);
  const router = Router();

  const createTransfer = z.object({
    recipientEmail: z.string().trim().email().max(320),
    trackIds: z
      .array(z.string().uuid())
      .min(1)
      .max(MAX_TRANSFER_TRACKS)
      .refine((ids) => new Set(ids).size === ids.length, "Titres en double."),
    expiresAt: z.string().datetime({ offset: true }),
    rightsConfirmed: z.literal(true),
  });

  router.post(
    "/events/:eventId/dj-transfers",
    authenticated,
    async (req, res) => {
      const identity = getIdentity(req);
      let parsed;
      try {
        parsed = createTransfer.parse(req.body);
        requireUuid(routeParam(req.params.eventId), "Identifiant d'événement");
      } catch {
        res.status(400).json({ error: "Données de transfert DJ invalides." });
        return;
      }

      const expiresAt = new Date(parsed.expiresAt);
      const maximumExpiry = Date.now() + MAX_TRANSFER_DAYS * 24 * 60 * 60 * 1000;
      if (
        !Number.isFinite(expiresAt.getTime()) ||
        expiresAt.getTime() <= Date.now() ||
        expiresAt.getTime() > maximumExpiry
      ) {
        res.status(400).json({ error: "L'expiration doit être future et inférieure à 90 jours." });
        return;
      }
      const recipientEmail = canonicalEmail(parsed.recipientEmail);
      if (recipientEmail === identity.verifiedEmail) {
        res.status(400).json({ error: "Le propriétaire ne peut pas être automatiquement destinataire." });
        return;
      }

      const client = await database.connect();
      try {
        await client.query("BEGIN");
        const eventResult = await client.query(
          `SELECT id, name
             FROM sillage_events
            WHERE id = $1 AND owner_id = $2
            FOR UPDATE`,
          [req.params.eventId, identity.userId],
        );
        if (!eventResult.rowCount) {
          throw new HttpError(404, "Événement introuvable.");
        }

        const tracksResult = await client.query(
          `SELECT id, title, artist, album, object_path, mime_type, byte_size
             FROM sillage_tracks
            WHERE event_id = $1
              AND id = ANY($2::uuid[])
              AND source = 'upload'
              AND object_path IS NOT NULL
              AND object_path LIKE '/objects/sillage/%'
              AND mime_type IS NOT NULL
              AND byte_size IS NOT NULL
              AND byte_size > 0
            FOR UPDATE`,
          [req.params.eventId, parsed.trackIds],
        );
        if (tracksResult.rowCount !== parsed.trackIds.length) {
          throw new HttpError(
            400,
            "Chaque titre doit appartenir à cet événement et être un fichier importé privé.",
          );
        }
        const trackPositions = new Map(
          parsed.trackIds.map((trackId, position) => [trackId, position]),
        );

        const transferResult = await client.query(
          `INSERT INTO sillage_dj_transfers
            (event_id, event_name_snapshot, owner_id, recipient_email,
             rights_confirmed_at, expires_at)
           VALUES ($1, $2, $3, $4, now(), $5)
           RETURNING id, event_id, event_name_snapshot, recipient_email,
                     recipient_user_id, bound_at, rights_confirmed_at,
                     expires_at, revoked_at, created_at`,
          [
            req.params.eventId,
            eventResult.rows[0].name,
            identity.userId,
            recipientEmail,
            expiresAt,
          ],
        );
        const transfer = transferResult.rows[0];
        for (const track of tracksResult.rows) {
          await client.query(
            `INSERT INTO sillage_dj_transfer_tracks
              (transfer_id, track_id, title_snapshot, artist_snapshot,
               album_snapshot, object_path_snapshot, mime_type_snapshot,
               byte_size_snapshot, position)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              transfer.id,
              track.id,
              track.title,
              track.artist,
              track.album ?? "",
              track.object_path,
              track.mime_type,
              track.byte_size,
              trackPositions.get(track.id) ?? 0,
            ],
          );
        }
        await client.query("COMMIT");
        res.status(201).json(
          mapTransfer(
            transfer,
            tracksResult.rows.map((track) => ({
              transfer_id: transfer.id,
              track_id: track.id,
              title_snapshot: track.title,
              artist_snapshot: track.artist,
              album_snapshot: track.album ?? "",
              mime_type_snapshot: track.mime_type,
              byte_size_snapshot: track.byte_size,
              position: trackPositions.get(track.id) ?? 0,
            })),
          ),
        );
      } catch (error) {
        await client.query("ROLLBACK");
        sendError(res, error);
      } finally {
        client.release();
      }
    },
  );

  router.get(
    "/events/:eventId/dj-transfers",
    authenticated,
    async (req, res) => {
      const identity = getIdentity(req);
      try {
        requireUuid(routeParam(req.params.eventId), "Identifiant d'événement");
        const ownerEvent = await database.query(
          "SELECT id FROM sillage_events WHERE id = $1 AND owner_id = $2",
          [req.params.eventId, identity.userId],
        );
        if (!ownerEvent.rowCount) throw new HttpError(404, "Événement introuvable.");
        const result = await database.query(
          `SELECT id, event_id, event_name_snapshot, recipient_email, recipient_user_id,
                  bound_at, rights_confirmed_at, expires_at, revoked_at, created_at
             FROM sillage_dj_transfers
            WHERE event_id = $1
            ORDER BY created_at DESC`,
          [req.params.eventId],
        );
        const transfers = await Promise.all(
          result.rows.map(async (row) => {
            const [tracks, history] = await Promise.all([
              transferTracks(database, row.id),
              transferHistory(database, row.id),
            ]);
            return mapTransfer(row, tracks, history);
          }),
        );
        res.json(transfers);
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.post(
    "/dj-transfers/:transferId/revoke",
    authenticated,
    async (req, res) => {
      const identity = getIdentity(req);
      try {
        requireUuid(routeParam(req.params.transferId), "Identifiant de transfert");
        const client = await database.connect();
        try {
          await client.query("BEGIN");
          const transfer = await client.query(
            `SELECT id, revoked_at
               FROM sillage_dj_transfers
              WHERE id = $1 AND owner_id = $2
              FOR UPDATE`,
            [req.params.transferId, identity.userId],
          );
          if (!transfer.rowCount) throw new HttpError(404, "Transfert DJ introuvable.");
          const updated = await client.query(
            `UPDATE sillage_dj_transfers
                SET revoked_at = COALESCE(revoked_at, now()), updated_at = now()
              WHERE id = $1
              RETURNING revoked_at`,
            [req.params.transferId],
          );
          await client.query("COMMIT");
          res.json({ id: req.params.transferId, revokedAt: updated.rows[0].revoked_at });
        } catch (error) {
          await client.query("ROLLBACK");
          sendError(res, error);
        } finally {
          client.release();
        }
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.get("/dj-transfers/received", authenticated, async (req, res) => {
    const identity = getIdentity(req);
    try {
      const result = await database.query(
        `SELECT id, event_id, event_name_snapshot, recipient_email, recipient_user_id,
                bound_at, rights_confirmed_at, expires_at, revoked_at, created_at
           FROM sillage_dj_transfers
          WHERE owner_id <> $1
            AND (recipient_user_id = $1
              OR (recipient_user_id IS NULL AND recipient_email = $2))
          ORDER BY created_at DESC`,
        [identity.userId, identity.verifiedEmail],
      );
      const transfers = await Promise.all(
        result.rows.map(async (row) => mapTransfer(row, await transferTracks(database, row.id))),
      );
      res.json(transfers);
    } catch (error) {
      sendError(res, error);
    }
  });

  /**
   * Visiting the copyable URL is the binding operation. It is transactional
   * and locks the row, so two Clerk accounts cannot claim an email grant at
   * the same time.
   */
  router.get("/dj-transfers/:transferId", authenticated, async (req, res) => {
    const identity = getIdentity(req);
    try {
      const transferId = routeParam(req.params.transferId);
      requireUuid(transferId, "Identifiant de transfert");
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        const transferResult = await client.query(
          `SELECT id, event_id, event_name_snapshot, owner_id, recipient_email,
                  recipient_user_id, bound_at, rights_confirmed_at, expires_at,
                  revoked_at, created_at
             FROM sillage_dj_transfers
            WHERE id = $1
            FOR UPDATE`,
          [transferId],
        );
        const transfer = transferResult.rows[0];
        const ownerView = Boolean(
          transfer && transfer.owner_id === identity.userId,
        );
        if (
          !transfer ||
          (!ownerView &&
            (transfer.recipient_user_id !== null &&
              transfer.recipient_user_id !== identity.userId ||
              transfer.recipient_user_id === null &&
                transfer.recipient_email !== identity.verifiedEmail))
        ) {
          throw new HttpError(404, "Transfert DJ introuvable.");
        }
        if (!ownerView && transfer.revoked_at) {
          throw new HttpError(410, "Ce transfert DJ a été révoqué.");
        }
        if (
          !ownerView &&
          new Date(transfer.expires_at).getTime() <= Date.now()
        ) {
          throw new HttpError(410, "Ce transfert DJ a expiré.");
        }
        if (!ownerView && !transfer.recipient_user_id) {
          const bound = await client.query(
            `UPDATE sillage_dj_transfers
                SET recipient_user_id = $1, bound_at = now(), updated_at = now()
              WHERE id = $2 AND recipient_user_id IS NULL
              RETURNING recipient_user_id, bound_at`,
            [identity.userId, transferId],
          );
          if (!bound.rowCount) throw new HttpError(409, "Ce transfert vient d'être lié à un autre compte.");
          transfer.recipient_user_id = bound.rows[0].recipient_user_id;
          transfer.bound_at = bound.rows[0].bound_at;
        }
        const tracks = await client.query<TransferTrackRow>(
          `SELECT transfer_id, track_id, title_snapshot, artist_snapshot, album_snapshot,
                  mime_type_snapshot, byte_size_snapshot, position
             FROM sillage_dj_transfer_tracks
            WHERE transfer_id = $1
            ORDER BY position, track_id`,
          [transferId],
        );
        await client.query("COMMIT");
        const history = ownerView
          ? await transferHistory(database, transferId)
          : undefined;
        res.json(mapTransfer(transfer, tracks.rows, history));
      } catch (error) {
        await client.query("ROLLBACK");
        sendError(res, error);
      } finally {
        client.release();
      }
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get(
    "/dj-transfers/:transferId/tracks/:trackId/download",
    authenticated,
    async (req, res) => {
      const identity = getIdentity(req);
      const transferId = routeParam(req.params.transferId);
      const trackId = routeParam(req.params.trackId);
      let auditContext: {
        transferId: string;
        trackId: string;
        title?: string;
        userId: string;
        recipientEmail?: string;
      } = { transferId, trackId, userId: identity.userId };
      let attemptId: string | undefined;
      let source: DownloadSource | undefined;

      try {
        requireUuid(transferId, "Identifiant de transfert");
        requireUuid(trackId, "Identifiant de titre");
        const client = await database.connect();
        let clientReleased = false;
        try {
          await client.query("BEGIN");
          const grantResult = await client.query(
            `SELECT id, owner_id, recipient_email, recipient_user_id, revoked_at, expires_at
               FROM sillage_dj_transfers
              WHERE id = $1
              FOR UPDATE`,
            [transferId],
          );
          const grant = grantResult.rows[0];
          auditContext.recipientEmail = grant?.recipient_email;
          if (
            !grant ||
            grant.owner_id === identity.userId ||
            grant.recipient_user_id !== identity.userId ||
            grant.revoked_at ||
            new Date(grant.expires_at).getTime() <= Date.now()
          ) {
            throw new HttpError(404, "Téléchargement DJ non autorisé.");
          }
          const trackResult = await client.query<{
            track_id: string;
            title_snapshot: string;
            object_path_snapshot: string;
            mime_type_snapshot: string;
            byte_size_snapshot: number;
          }>(
            `SELECT track_id, title_snapshot, object_path_snapshot,
                    mime_type_snapshot, byte_size_snapshot
               FROM sillage_dj_transfer_tracks
              WHERE transfer_id = $1 AND track_id = $2`,
            [transferId, trackId],
          );
          const track = trackResult.rows[0];
          if (!track) throw new HttpError(404, "Titre non sélectionné pour ce transfert.");
          auditContext.title = track.title_snapshot;
          source = await openDownload(track.object_path_snapshot);
          const attempt = await client.query(
            `INSERT INTO sillage_dj_transfer_attempts
              (transfer_id, track_id, title_snapshot, user_id, recipient_email,
               status, bytes_transferred, server_transfer_completed)
             VALUES ($1, $2, $3, $4, $5, 'initiated', 0, false)
             RETURNING id`,
            [
              transferId,
              track.track_id,
              track.title_snapshot,
              identity.userId,
              grant.recipient_email,
            ],
          );
          attemptId = attempt.rows[0].id;
          await client.query("COMMIT");
          // Authorization is now durably recorded; do not hold a database
          // connection for the lifetime of a potentially long audio stream.
          client.release();
          clientReleased = true;

          const actualContentType = source.contentType || track.mime_type_snapshot;
          res.status(200);
          res.setHeader("Cache-Control", "private, no-store");
          res.setHeader("Content-Type", actualContentType);
          res.setHeader("Content-Length", source.size);
          res.setHeader("Accept-Ranges", "none");
          res.setHeader(
            "Content-Disposition",
            contentDisposition(track.title_snapshot, actualContentType),
          );
          // Range is intentionally ignored: this endpoint always sends the
          // authorized full attachment and never creates a partial grant.
          const outcome = await pipeDownload(req, res, source);
          await database.query(
            `UPDATE sillage_dj_transfer_attempts
                SET status = $1, failure_reason = $2, bytes_transferred = $3,
                    server_transfer_completed = $4, completed_at = now()
              WHERE id = $5`,
            [
              outcome.status,
              outcome.reason ?? null,
              outcome.bytes,
              outcome.status === "served",
              attemptId,
            ],
          );
        } catch (error) {
          if (!clientReleased) {
            try {
              await client.query("ROLLBACK");
            } finally {
              // Release before the audit insert so a test or production pool
              // configured with one connection cannot deadlock on failure.
              client.release();
              clientReleased = true;
            }
          }
          source?.cancel();
          await recordFailedAttempt(database, { ...auditContext, reason: error instanceof Error ? error.message : "storage failure" });
          sendError(res, error);
        } finally {
          if (!clientReleased) client.release();
        }
      } catch (error) {
        await recordFailedAttempt(database, { ...auditContext, reason: error instanceof Error ? error.message : "download failure" });
        sendError(res, error);
      }
    },
  );

  return router;
}

export default createDjTransfersRouter();
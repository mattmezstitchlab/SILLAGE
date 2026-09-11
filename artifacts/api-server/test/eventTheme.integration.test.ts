import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { after, before, test } from "node:test";
import express from "express";
import sharp from "sharp";
import { pool } from "@workspace/db";
import {
  createEventThemeRouter,
} from "../src/routes/eventTheme";
import {
  normalizeThemeImage,
} from "../src/lib/themeImageValidation";
import type {
  ThemeImageObject,
  ThemeImageStorage,
} from "../src/lib/themeImageStorage";

const ownerId = `theme-owner-${randomUUID()}`;
const otherOwnerId = `theme-other-owner-${randomUUID()}`;
const eventId = randomUUID();
const otherEventId = randomUUID();
const shareToken = `theme-share-${randomUUID()}`;

class MemoryThemeStorage implements ThemeImageStorage {
  readonly objects = new Map<string, { bytes: Buffer; contentType: string }>();

  async put(bytes: Buffer, contentType: string) {
    const imageId = randomUUID();
    const objectPath = `/objects/sillage-themes/${imageId}`;
    this.objects.set(objectPath, { bytes, contentType });
    return { imageId, objectPath };
  }

  async open(objectPath: string): Promise<ThemeImageObject> {
    const object = this.objects.get(objectPath);
    if (!object) throw new Error("Object not found");
    return {
      stream: Readable.from(object.bytes),
      size: object.bytes.length,
      contentType: object.contentType,
    };
  }

  async remove(objectPath: string) {
    this.objects.delete(objectPath);
  }
}

const storage = new MemoryThemeStorage();
const app = express();
app.use(express.json());
app.use(
  createEventThemeRouter({
    storage,
    resolveOwner: (request) => {
      const identity = request.header("x-integration-identity");
      return identity === "owner"
        ? ownerId
        : identity === "other-owner"
          ? otherOwnerId
          : null;
    },
  }),
);

let server: ReturnType<typeof app.listen>;
let baseUrl = "";

function request(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof Buffer
        ? { "Content-Type": "image/png" }
        : { "Content-Type": "application/json" }),
      ...(init.headers ?? {}),
    },
  });
}

before(async () => {
  await pool.query(
    `INSERT INTO sillage_events (id, owner_id, name)
     VALUES ($1, $2, 'Theme integration event'), ($3, $4, 'Other event')`,
    [eventId, ownerId, otherEventId, otherOwnerId],
  );
  await pool.query(
    `INSERT INTO sillage_shares (event_id, token_hash, token_ciphertext)
     VALUES ($1, $2, 'test-ciphertext')`,
    [eventId, createHash("sha256").update(shareToken).digest("hex")],
  );
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server failed.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.query("DELETE FROM sillage_events WHERE id = ANY($1::uuid[])", [
    [eventId, otherEventId],
  ]);
  await pool.end();
});

test("persists themes with CAS, stages images, and enforces guest consent", async () => {
  const initial = await request(`/events/${eventId}/theme`, {
    headers: { "x-integration-identity": "owner" },
  });
  assert.equal(initial.status, 200);
  assert.deepEqual(await initial.json(), {
    mode: "studio",
    imageId: null,
    imageUrl: null,
    focalX: 50,
    focalY: 50,
    overlay: 0.5,
    guestImageConsent: false,
    revision: 1,
  });

  const png = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r: 20, g: 30, b: 40 },
    },
  })
    .png()
    .toBuffer();
  const upload = await request(`/events/${eventId}/theme/images`, {
    method: "POST",
    headers: { "x-integration-identity": "owner" },
    body: png,
  });
  assert.equal(upload.status, 201);
  const staged = (await upload.json()) as { imageId: string; imageUrl: string };
  assert.match(staged.imageUrl, new RegExp(`/api/events/${eventId}/theme/images/`));
  assert.doesNotMatch(staged.imageUrl, /\/objects\//);
  for (const objectPath of storage.objects.keys()) {
    assert.match(objectPath, /^\/objects\/sillage-themes\//);
    assert.doesNotMatch(objectPath, /^\/objects\/sillage\//);
  }
  const ownerImage = await request(
    `/events/${eventId}/theme/images/${staged.imageId}`,
    { headers: { "x-integration-identity": "owner" } },
  );
  assert.equal(ownerImage.status, 200);
  assert.equal(ownerImage.headers.get("cache-control"), "private, no-store");
  assert.equal(ownerImage.headers.get("content-type"), "image/webp");

  const beforeSelection = await request(`/events/${eventId}/theme`, {
    headers: { "x-integration-identity": "owner" },
  });
  assert.equal((await beforeSelection.json()).imageId, null);
  const guestWithoutConsent = await request(`/guest/${shareToken}/theme`);
  assert.equal(guestWithoutConsent.status, 200);
  assert.equal((await guestWithoutConsent.json()).imageId, null);
  assert.equal(
    (await request(`/guest/${shareToken}/theme/image`)).status,
    404,
  );

  const saved = await request(`/events/${eventId}/theme`, {
    method: "PUT",
    headers: { "x-integration-identity": "owner" },
    body: JSON.stringify({
      mode: "editorial",
      imageId: staged.imageId,
      focalX: 18,
      focalY: 77,
      overlay: 0.42,
      guestImageConsent: true,
      revision: 1,
    }),
  });
  assert.equal(saved.status, 200);
  const savedTheme = (await saved.json()) as {
    revision: number;
    imageId: string;
  };
  assert.equal(savedTheme.revision, 2);
  assert.equal(savedTheme.imageId, staged.imageId);
  const retrieved = await request(`/events/${eventId}/theme`, {
    headers: { "x-integration-identity": "owner" },
  });
  assert.equal(retrieved.status, 200);
  assert.equal((await retrieved.json()).revision, 2);

  const persisted = await pool.query(
    "SELECT mode, image_id, focal_x, focal_y, overlay, guest_image_consent, revision FROM sillage_event_themes WHERE event_id = $1",
    [eventId],
  );
  assert.equal(persisted.rows[0].mode, "editorial");
  assert.equal(persisted.rows[0].image_id, staged.imageId);
  assert.equal(persisted.rows[0].revision, 2);

  const stale = await request(`/events/${eventId}/theme`, {
    method: "PUT",
    headers: { "x-integration-identity": "owner" },
    body: JSON.stringify({
      mode: "signature",
      imageId: staged.imageId,
      focalX: 0,
      focalY: 0,
      overlay: 0,
      guestImageConsent: true,
      revision: 1,
    }),
  });
  assert.equal(stale.status, 409);

  const guest = await request(`/guest/${shareToken}/theme`);
  assert.equal(guest.status, 200);
  assert.equal((await guest.json()).imageId, staged.imageId);
  const guestImage = await request(`/guest/${shareToken}/theme/image`);
  assert.equal(guestImage.status, 200);
  assert.equal(guestImage.headers.get("cache-control"), "private, no-store");

  const withdrawn = await request(`/events/${eventId}/theme`, {
    method: "PUT",
    headers: { "x-integration-identity": "owner" },
    body: JSON.stringify({
      mode: "editorial",
      imageId: staged.imageId,
      focalX: 18,
      focalY: 77,
      overlay: 0.42,
      guestImageConsent: false,
      revision: 2,
    }),
  });
  assert.equal(withdrawn.status, 200);
  const guestAfterWithdrawal = await request(`/guest/${shareToken}/theme`);
  assert.equal((await guestAfterWithdrawal.json()).imageId, null);
  assert.equal(
    (await request(`/guest/${shareToken}/theme/image`)).status,
    404,
  );

  await pool.query("UPDATE sillage_shares SET revoked_at = now() WHERE event_id = $1", [
    eventId,
  ]);
  assert.equal((await request(`/guest/${shareToken}/theme`)).status, 404);
});

test("rejects foreign assets and malformed or spoofed images", async () => {
  const foreignImageId = randomUUID();
  const foreignPath = `/objects/sillage-themes/${foreignImageId}`;
  await pool.query(
    `INSERT INTO sillage_theme_images
      (id, event_id, owner_id, object_path, mime_type, byte_size, width, height)
     VALUES ($1, $2, $3, $4, 'image/webp', 1, 1, 1)`,
    [foreignImageId, otherEventId, otherOwnerId, foreignPath],
  );
  const foreign = await request(`/events/${eventId}/theme`, {
    method: "PUT",
    headers: { "x-integration-identity": "owner" },
    body: JSON.stringify({
      mode: "studio",
      imageId: foreignImageId,
      focalX: 50,
      focalY: 50,
      overlay: 0.35,
      guestImageConsent: false,
      revision: 3,
    }),
  });
  assert.equal(foreign.status, 400);

  const validPng = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  })
    .png()
    .toBuffer();
  const invalidMime = await request(`/events/${eventId}/theme/images`, {
    method: "POST",
    headers: {
      "x-integration-identity": "owner",
      "Content-Type": "image/gif",
    },
    body: validPng,
  });
  assert.equal(invalidMime.status, 400);

  const spoofedMime = await request(`/events/${eventId}/theme/images`, {
    method: "POST",
    headers: {
      "x-integration-identity": "owner",
      "Content-Type": "image/jpeg",
    },
    body: validPng,
  });
  assert.equal(spoofedMime.status, 400);

  const oversizedDimensions = await sharp({
    create: {
      width: 8_001,
      height: 1,
      channels: 3,
      background: { r: 1, g: 2, b: 3 },
    },
  })
    .png()
    .toBuffer();
  const bounded = await request(`/events/${eventId}/theme/images`, {
    method: "POST",
    headers: {
      "x-integration-identity": "owner",
      "Content-Type": "image/png",
    },
    body: oversizedDimensions,
  });
  assert.equal(bounded.status, 400);

  await assert.rejects(
    normalizeThemeImage(Buffer.from("<svg></svg>"), "image/svg+xml"),
    /Format d’image refusé/,
  );
  await assert.rejects(
    normalizeThemeImage(Buffer.from("not-an-image"), "image/png"),
    /invalide|corrompue/,
  );
});
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import http from "node:http";
import { after, before, test } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { clerkMiddleware } from "@clerk/express";
import { pool } from "@workspace/db";
import {
  createDjTransfersRouter,
  type DjIdentity,
} from "../src/routes/djTransfers";
import sillageRouter from "../src/routes/sillage";

const owner: DjIdentity = {
  userId: `user_owner_${randomUUID()}`,
  verifiedEmail: `owner-${randomUUID()}@example.com`,
};
const dj: DjIdentity = {
  userId: `user_dj_${randomUUID()}`,
  verifiedEmail: `dj-${randomUUID()}@example.com`,
};
const otherDj: DjIdentity = {
  userId: `user_other_dj_${randomUUID()}`,
  verifiedEmail: `dj-other-${randomUUID()}@example.com`,
};
const otherOwner: DjIdentity = {
  userId: `user_other_owner_${randomUUID()}`,
  verifiedEmail: `owner-other-${randomUUID()}@example.com`,
};

const eventId = randomUUID();
const otherEventId = randomUUID();
const uploadedTrackId = randomUUID();
const secondUploadedTrackId = randomUUID();
const catalogueTrackId = randomUUID();
const emptyUploadedTrackId = randomUUID();
const otherOwnerTrackId = randomUUID();
const uploadedObjectPath = `/objects/sillage/integration-${randomUUID()}`;
const secondObjectPath = `/objects/sillage/integration-second-${randomUUID()}`;
const missingObjectPath = `/objects/sillage/integration-missing-${randomUUID()}`;
const abortedObjectPath = `/objects/sillage/integration-aborted-${randomUUID()}`;

let baseUrl = "";
let closeServer: (() => Promise<void>) | undefined;

const identities = new Map<string, DjIdentity>([
  ["owner", owner],
  ["dj", dj],
  ["other-dj", otherDj],
  ["other-owner", otherOwner],
]);

function authHeader(identity: string): HeadersInit {
  return { "x-integration-identity": identity };
}

function expiresIn(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function request(
  path: string,
  init: RequestInit & { identity?: string } = {},
): Promise<Response> {
  const { identity, headers, ...requestInit } = init;
  return fetch(`${baseUrl}${path}`, {
    ...requestInit,
    headers: {
      ...(identity ? authHeader(identity) : {}),
      ...headers,
    },
  });
}

async function abortRequest(path: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const client = http.request(new URL(`${baseUrl}${path}`), {
      headers: authHeader("dj"),
    });
    client.once("response", (response) => {
      response.destroy();
      resolve();
    });
    client.once("error", () => resolve());
    client.end();
  });
}

async function waitForHistory(
  transferId: string,
  status: "initiated" | "served" | "failed" | "aborted",
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await pool.query(
      `SELECT id, track_id, title_snapshot, user_id, status,
              initiated_at, completed_at
         FROM sillage_dj_transfer_attempts
        WHERE transfer_id = $1 AND status = $2
        ORDER BY initiated_at DESC
        LIMIT 1`,
      [transferId, status],
    );
    if (result.rowCount) return result.rows[0];
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${status} audit`);
}

async function createTransfer(trackIds: string[], identity = "owner") {
  return request(`/events/${eventId}/dj-transfers`, {
    method: "POST",
    identity,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipientEmail: dj.verifiedEmail,
      trackIds,
      expiresAt: expiresIn(7),
      rightsConfirmed: true,
    }),
  });
}

before(async () => {
  await pool.query(
    `INSERT INTO sillage_events (id, owner_id, name)
     VALUES ($1, $2, $3), ($4, $5, $6)`,
    [
      eventId,
      owner.userId,
      "DJ transfer integration event",
      otherEventId,
      otherOwner.userId,
      "Other owner's event",
    ],
  );
  await pool.query(
    `INSERT INTO sillage_tracks
      (id, event_id, title, artist, album, source, object_path, mime_type, byte_size)
     VALUES
      ($1, $2, $3, 'Integration artist', '', 'upload', $4, 'audio/mpeg', 14),
      ($5, $2, 'Second selected', 'Integration artist', '', 'upload', $6, 'audio/mpeg', 6),
      ($7, $2, 'Catalogue only', 'Integration artist', '', 'catalogue', NULL, NULL, NULL),
      ($8, $2, 'Empty upload', 'Integration artist', '', 'upload', $9, 'audio/mpeg', 0),
      ($10, $11, 'Another owner file', 'Other artist', '', 'upload', $12, 'audio/mpeg', 14)`,
    [
      uploadedTrackId,
      eventId,
      "Été / Live",
      uploadedObjectPath,
      secondUploadedTrackId,
      secondObjectPath,
      catalogueTrackId,
      emptyUploadedTrackId,
      `/objects/sillage/integration-empty-${randomUUID()}`,
      otherOwnerTrackId,
      otherEventId,
      `/objects/sillage/integration-other-${randomUUID()}`,
    ],
  );

  const app = express();
  app.use(express.json());
  // Keep the existing owner stream mounted in this integration server. The
  // final test asserts its anonymous boundary while all DJ tests use the
  // injected identity resolver above.
  app.use(clerkMiddleware());
  app.use(
    createDjTransfersRouter({
      db: pool,
      resolveIdentity: async (req) => {
        const key = req.header("x-integration-identity");
        return key ? identities.get(key) ?? null : null;
      },
      openDownload: async (objectPath) => {
        if (objectPath === missingObjectPath) {
          throw new Error("fake storage object missing");
        }
        if (objectPath === abortedObjectPath) {
          let pushed = false;
          const stream = new Readable({
            read() {
              if (pushed) return;
              pushed = true;
              setTimeout(() => this.push(Buffer.from("partial")), 100);
            },
          });
          return {
            stream,
            size: 100,
            contentType: "audio/mpeg",
            cancel: () => stream.destroy(),
          };
        }
        const bytes =
          objectPath === secondObjectPath
            ? Buffer.from("second")
            : Buffer.from("integration-audio");
        const stream = Readable.from(bytes);
        return {
          stream,
          size: bytes.length,
          contentType: "audio/mpeg",
          cancel: () => stream.destroy(),
        };
      },
    }),
  );
  app.use(sillageRouter);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});

after(async () => {
  if (closeServer) await closeServer();
  await pool.query(
    `DELETE FROM sillage_dj_transfer_attempts
      WHERE transfer_id IN (SELECT id FROM sillage_dj_transfers WHERE event_id = ANY($1::uuid[]))`,
    [[eventId, otherEventId]],
  );
  await pool.query(
    "DELETE FROM sillage_dj_transfers WHERE event_id = ANY($1::uuid[])",
    [[eventId, otherEventId]],
  );
  await pool.query("DELETE FROM sillage_tracks WHERE id = ANY($1::uuid[])", [
    [
      uploadedTrackId,
      secondUploadedTrackId,
      catalogueTrackId,
      emptyUploadedTrackId,
      otherOwnerTrackId,
    ],
  ]);
  await pool.query("DELETE FROM sillage_events WHERE id = ANY($1::uuid[])", [
    [eventId, otherEventId],
  ]);
  await pool.end();
});

test("requires a signed-in verified recipient and keeps owner sharing transactional", async () => {
  const anonymous = await createTransfer([uploadedTrackId], "");
  assert.equal(anonymous.status, 401);

  const crossEvent = await createTransfer(
    [uploadedTrackId, otherOwnerTrackId],
  );
  assert.equal(crossEvent.status, 400);

  const catalogue = await createTransfer([catalogueTrackId]);
  assert.equal(catalogue.status, 400);
  const emptyUpload = await createTransfer([emptyUploadedTrackId]);
  assert.equal(emptyUpload.status, 400);

  const valid = await createTransfer([uploadedTrackId, secondUploadedTrackId]);
  assert.equal(valid.status, 201);
  const transfer = (await valid.json()) as {
    id: string;
    tracks: Array<{ id: string }>;
    recipientUserId: string | null;
    url: string;
  };
  assert.equal(transfer.recipientUserId, null);
  assert.deepEqual(
    transfer.tracks.map((track) => track.id),
    [uploadedTrackId, secondUploadedTrackId],
  );
  assert.equal(transfer.url, `/dj-transfers/${transfer.id}`);
  assert.doesNotMatch(JSON.stringify(transfer), /\/objects\//);
  return transfer.id;
});

test("binds to the first verified recipient and rejects anonymous, other DJs, and unselected files", async () => {
  const valid = await createTransfer([uploadedTrackId]);
  const transfer = (await valid.json()) as { id: string };

  const anonymous = await request(`/dj-transfers/${transfer.id}`);
  assert.equal(anonymous.status, 401);

  const other = await request(`/dj-transfers/${transfer.id}`, {
    identity: "other-dj",
  });
  assert.equal(other.status, 404);

  const received = await request("/dj-transfers/received", { identity: "dj" });
  assert.equal(received.status, 200);
  const receivedTransfers = (await received.json()) as Array<{
    id: string;
    recipientUserId: string | null;
  }>;
  assert.equal(
    receivedTransfers.find((candidate) => candidate.id === transfer.id)
      ?.recipientUserId,
    null,
  );

  const bound = await request(`/dj-transfers/${transfer.id}`, { identity: "dj" });
  assert.equal(bound.status, 200);
  const boundBody = (await bound.json()) as { recipientUserId: string };
  assert.equal(boundBody.recipientUserId, dj.userId);

  const takeover = await request(`/dj-transfers/${transfer.id}`, {
    identity: "other-dj",
  });
  assert.equal(takeover.status, 404);
  const row = await pool.query(
    "SELECT recipient_user_id FROM sillage_dj_transfers WHERE id = $1",
    [transfer.id],
  );
  assert.equal(row.rows[0].recipient_user_id, dj.userId);

  const nonSelected = await request(
    `/dj-transfers/${transfer.id}/tracks/${secondUploadedTrackId}/download`,
    { identity: "dj" },
  );
  assert.equal(nonSelected.status, 404);
});

test("streams a safe full attachment, audits failure, and blocks expiry/revocation", async () => {
  const valid = await createTransfer([uploadedTrackId]);
  const transfer = (await valid.json()) as {
    id: string;
    tracks: Array<{ downloadUrl: string }>;
  };
  await request(`/dj-transfers/${transfer.id}`, { identity: "dj" });

  const download = await request(
    `/dj-transfers/${transfer.id}/tracks/${uploadedTrackId}/download`,
    { identity: "dj", headers: { Range: "bytes=0-1" } },
  );
  assert.equal(download.status, 200);
  assert.equal(await download.text(), "integration-audio");
  assert.equal(download.headers.get("accept-ranges"), "none");
  assert.equal(download.headers.get("cache-control"), "private, no-store");
  assert.match(
    download.headers.get("content-disposition") ?? "",
    /filename="Ete - Live\.mp3"/,
  );
  assert.match(
    download.headers.get("content-disposition") ?? "",
    /filename\*=UTF-8''%C3%89t%C3%A9%20-%20Live\.mp3/,
  );
  assert.equal(
    transfer.tracks[0].downloadUrl,
    `/api/dj-transfers/${transfer.id}/tracks/${uploadedTrackId}/download`,
  );
  const servedAudit = await waitForHistory(transfer.id, "served");
  assert.equal(servedAudit.track_id, uploadedTrackId);
  assert.equal(servedAudit.title_snapshot, "Été / Live");
  assert.equal(servedAudit.user_id, dj.userId);
  assert.ok(servedAudit.initiated_at);
  assert.ok(servedAudit.completed_at);

  const recipientDetail = await request(`/dj-transfers/${transfer.id}`, {
    identity: "dj",
  });
  assert.equal(recipientDetail.status, 200);
  const recipientPayload = (await recipientDetail.json()) as {
    history?: unknown;
  };
  assert.equal(recipientPayload.history, undefined);

  const ownerDetail = await request(`/dj-transfers/${transfer.id}`, {
    identity: "owner",
  });
  assert.equal(ownerDetail.status, 200);
  const ownerPayload = (await ownerDetail.json()) as {
    history: Array<Record<string, unknown>>;
  };
  const servedHistory = ownerPayload.history.find(
    (entry) => entry.status === "served",
  );
  assert.deepEqual(Object.keys(servedHistory ?? {}).sort(), [
    "completedAt",
    "djUserId",
    "id",
    "startedAt",
    "status",
    "titleSnapshot",
    "trackId",
  ]);
  assert.equal(servedHistory?.titleSnapshot, "Été / Live");
  assert.equal(servedHistory?.djUserId, dj.userId);
  assert.equal("recipientEmail" in (servedHistory ?? {}), false);
  assert.equal("failureReason" in (servedHistory ?? {}), false);
  assert.equal("bytesTransferred" in (servedHistory ?? {}), false);

  const ownerList = await request(`/events/${eventId}/dj-transfers`, {
    identity: "owner",
  });
  assert.equal(ownerList.status, 200);
  const ownerListPayload = (await ownerList.json()) as Array<{
    id: string;
    history?: Array<{ status: string }>;
  }>;
  assert.equal(
    ownerListPayload.find((entry) => entry.id === transfer.id)?.history?.some(
      (entry) => entry.status === "served",
    ),
    true,
  );
  const otherOwnerDetail = await request(`/dj-transfers/${transfer.id}`, {
    identity: "other-owner",
  });
  assert.equal(otherOwnerDetail.status, 404);

  const missingTransferResponse = await createTransfer([uploadedTrackId]);
  const missingTransfer = (await missingTransferResponse.json()) as { id: string };
  await pool.query(
    `UPDATE sillage_dj_transfer_tracks
        SET object_path_snapshot = $1
      WHERE transfer_id = $2`,
    [missingObjectPath, missingTransfer.id],
  );
  await request(`/dj-transfers/${missingTransfer.id}`, { identity: "dj" });
  const failed = await request(
    `/dj-transfers/${missingTransfer.id}/tracks/${uploadedTrackId}/download`,
    { identity: "dj" },
  );
  assert.equal(failed.status, 500);
  const failedAudit = await pool.query(
    `SELECT status, server_transfer_completed
       FROM sillage_dj_transfer_attempts
      WHERE transfer_id = $1
      ORDER BY initiated_at DESC
      LIMIT 1`,
    [missingTransfer.id],
  );
  assert.equal(failedAudit.rows[0].status, "failed");
  assert.equal(failedAudit.rows[0].server_transfer_completed, false);
  const missingOwnerDetail = await request(
    `/dj-transfers/${missingTransfer.id}`,
    { identity: "owner" },
  );
  assert.equal(missingOwnerDetail.status, 200);
  const missingOwnerPayload = (await missingOwnerDetail.json()) as {
    history: Array<{
      status: string;
      titleSnapshot: string | null;
      completedAt: string | null;
    }>;
  };
  const failedHistory = missingOwnerPayload.history.find(
    (entry) => entry.status === "failed",
  );
  assert.equal(failedHistory?.titleSnapshot, "Été / Live");
  assert.ok(failedHistory?.completedAt);

  const abortedTransferResponse = await createTransfer([uploadedTrackId]);
  const abortedTransfer = (await abortedTransferResponse.json()) as { id: string };
  await pool.query(
    `UPDATE sillage_dj_transfer_tracks
        SET object_path_snapshot = $1
      WHERE transfer_id = $2`,
    [abortedObjectPath, abortedTransfer.id],
  );
  await request(`/dj-transfers/${abortedTransfer.id}`, { identity: "dj" });
  await abortRequest(
    `/dj-transfers/${abortedTransfer.id}/tracks/${uploadedTrackId}/download`,
  );
  const abortedAudit = await waitForHistory(abortedTransfer.id, "aborted");
  assert.equal(abortedAudit.user_id, dj.userId);
  assert.equal(abortedAudit.completed_at !== null, true);

  const revokedResponse = await createTransfer([uploadedTrackId]);
  const revoked = (await revokedResponse.json()) as { id: string };
  await request(`/dj-transfers/${revoked.id}`, { identity: "dj" });
  const revoke = await request(`/dj-transfers/${revoked.id}/revoke`, {
    method: "POST",
    identity: "owner",
  });
  assert.equal(revoke.status, 200);
  const revokedDownload = await request(
    `/dj-transfers/${revoked.id}/tracks/${uploadedTrackId}/download`,
    { identity: "dj" },
  );
  assert.equal(revokedDownload.status, 404);

  const expiredResponse = await createTransfer([uploadedTrackId]);
  const expired = (await expiredResponse.json()) as { id: string };
  await pool.query(
    "UPDATE sillage_dj_transfers SET expires_at = now() - interval '1 second' WHERE id = $1",
    [expired.id],
  );
  const expiredView = await request(`/dj-transfers/${expired.id}`, {
    identity: "dj",
  });
  assert.equal(expiredView.status, 410);
  const expiredDownload = await request(
    `/dj-transfers/${expired.id}/tracks/${uploadedTrackId}/download`,
    { identity: "dj" },
  );
  assert.equal(expiredDownload.status, 404);
});

test("does not make the owner a recipient and preserves owner stream authorization boundary", async () => {
  const self = await request(`/events/${eventId}/dj-transfers`, {
    method: "POST",
    identity: "owner",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipientEmail: owner.verifiedEmail,
      trackIds: [uploadedTrackId],
      expiresAt: expiresIn(7),
      rightsConfirmed: true,
    }),
  });
  assert.equal(self.status, 400);

  const receivedForOwner = await request("/dj-transfers/received", {
    identity: "owner",
  });
  assert.equal(receivedForOwner.status, 200);
  assert.deepEqual(await receivedForOwner.json(), []);

  const anonymousOwnerStream = await request(
    `/tracks/${uploadedTrackId}/stream`,
  );
  assert.equal(anonymousOwnerStream.status, 401);
});
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * A DJ transfer is deliberately separate from sillage_shares. A guest share
 * grants access to the event proposal surface, while this grant is an
 * explicit, expiring selection of private uploaded tracks.
 */
export const sillageDjTransfers = pgTable("sillage_dj_transfers", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull(),
  eventNameSnapshot: text("event_name_snapshot").notNull(),
  ownerId: text("owner_id").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  recipientUserId: text("recipient_user_id"),
  boundAt: timestamp("bound_at", { withTimezone: true }),
  rightsConfirmedAt: timestamp("rights_confirmed_at", {
    withTimezone: true,
  }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [
  index("sillage_dj_transfers_event_idx").on(table.eventId, table.createdAt),
  index("sillage_dj_transfers_recipient_email_idx").on(
    table.recipientEmail,
    table.recipientUserId,
  ),
]);

/**
 * This is a snapshot, not a live join to sillage_tracks. Keeping the title
 * and object metadata here preserves a useful audit trail when an owner later
 * edits or removes a track.
 */
export const sillageDjTransferTracks = pgTable("sillage_dj_transfer_tracks", {
  transferId: uuid("transfer_id").notNull(),
  trackId: uuid("track_id").notNull(),
  titleSnapshot: text("title_snapshot").notNull(),
  artistSnapshot: text("artist_snapshot").notNull(),
  albumSnapshot: text("album_snapshot").notNull(),
  position: integer("position").notNull(),
  objectPathSnapshot: text("object_path_snapshot").notNull(),
  mimeTypeSnapshot: text("mime_type_snapshot").notNull(),
  byteSizeSnapshot: integer("byte_size_snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [
  primaryKey({
    name: "sillage_dj_transfer_tracks_pkey",
    columns: [table.transferId, table.trackId],
  }),
  index("sillage_dj_transfer_tracks_track_idx").on(table.trackId),
]);

/**
 * Download audit entries are append-only in application code. In particular,
 * a browser saving a response cannot be observed by the server; `served`
 * means the server completed the transfer to the connected client.
 */
export const sillageDjTransferAttempts = pgTable(
  "sillage_dj_transfer_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transferId: uuid("transfer_id").notNull(),
    trackId: uuid("track_id"),
    titleSnapshot: text("title_snapshot"),
    userId: text("user_id"),
    recipientEmail: text("recipient_email"),
    status: text("status").notNull(),
    failureReason: text("failure_reason"),
    bytesTransferred: integer("bytes_transferred").default(0).notNull(),
    serverTransferCompleted: boolean("server_transfer_completed")
      .default(false)
      .notNull(),
    initiatedAt: timestamp("initiated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("sillage_dj_transfer_attempts_transfer_idx").on(
      table.transferId,
      table.initiatedAt,
    ),
  ],
);
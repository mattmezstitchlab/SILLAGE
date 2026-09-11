import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const dates = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const sillageEvents = pgTable("sillage_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  eventDate: text("event_date"),
  revision: integer("revision").default(1).notNull(),
  ...dates,
});

export const sillageFolders = pgTable("sillage_folders", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => sillageEvents.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").default(0).notNull(),
  ...dates,
});

export const sillageTracks = pgTable("sillage_tracks", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => sillageEvents.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  album: text("album").default("").notNull(),
  coverUrl: text("cover_url"),
  durationSeconds: integer("duration_seconds"),
  previewUrl: text("preview_url"),
  storeUrl: text("store_url"),
  source: text("source").notNull(),
  objectPath: text("object_path"),
  mimeType: text("mime_type"),
  byteSize: integer("byte_size"),
  bpm: integer("bpm"),
  musicalKey: text("musical_key"),
  energy: integer("energy"),
  isExcluded: boolean("is_excluded").default(false).notNull(),
  ...dates,
});

export const sillagePlaylists = pgTable("sillage_playlists", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => sillageEvents.id, { onDelete: "cascade" }),
  folderId: uuid("folder_id").references(() => sillageFolders.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description").default("").notNull(),
  type: text("type").notNull(),
  revision: integer("revision").default(1).notNull(),
  ...dates,
});

export const sillagePlaylistTracks = pgTable("sillage_playlist_tracks", {
  playlistId: uuid("playlist_id").notNull().references(() => sillagePlaylists.id, { onDelete: "cascade" }),
  trackId: uuid("track_id").notNull().references(() => sillageTracks.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  locked: boolean("locked").default(false).notNull(),
}, (table) => [uniqueIndex("sillage_playlist_track_once").on(table.playlistId, table.trackId)]);

export const sillageMoments = pgTable("sillage_moments", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => sillageEvents.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  time: text("time").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  expectedEnergy: integer("expected_energy"),
  notes: text("notes"),
  revision: integer("revision").default(1).notNull(),
  ...dates,
});

export const sillageMomentTracks = pgTable("sillage_moment_tracks", {
  momentId: uuid("moment_id").notNull().references(() => sillageMoments.id, { onDelete: "cascade" }),
  trackId: uuid("track_id").notNull().references(() => sillageTracks.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
}, (table) => [uniqueIndex("sillage_moment_track_once").on(table.momentId, table.trackId)]);

export const sillageShares = pgTable("sillage_shares", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => sillageEvents.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  tokenCiphertext: text("token_ciphertext").notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ...dates,
});

export const sillageUploadIntents = pgTable("sillage_upload_intents", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => sillageEvents.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull(),
  objectPath: text("object_path").notNull().unique(),
  byteSize: integer("byte_size").notNull(),
  mimeType: text("mime_type").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sillageProposals = pgTable("sillage_proposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => sillageEvents.id, { onDelete: "cascade" }),
  guestName: text("guest_name").notNull(),
  message: text("message").default("").notNull(),
  trackData: jsonb("track_data").notNull(),
  status: text("status").default("proposed").notNull(),
  acceptedPlaylistId: uuid("accepted_playlist_id").references(() => sillagePlaylists.id, { onDelete: "set null" }),
  ...dates,
});

export const sillageProposalVotes = pgTable("sillage_proposal_votes", {
  proposalId: uuid("proposal_id").notNull().references(() => sillageProposals.id, { onDelete: "cascade" }),
  guestSessionHash: text("guest_session_hash").notNull(),
  ...dates,
}, (table) => [uniqueIndex("sillage_proposal_vote_once").on(table.proposalId, table.guestSessionHash)]);
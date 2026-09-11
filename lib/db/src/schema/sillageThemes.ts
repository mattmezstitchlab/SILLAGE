import {
  boolean,
  check,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { sillageEvents } from "./sillage";

/**
 * Image bytes are deliberately kept in a separate table from the saved
 * presentation. Uploading an image creates a staged asset; selecting it on a
 * theme is a separate optimistic write.
 */
export const sillageThemeImages = pgTable("sillage_theme_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => sillageEvents.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull(),
  objectPath: text("object_path").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [
  check("sillage_theme_image_size_positive", sql`${table.byteSize} > 0`),
  check("sillage_theme_image_width_positive", sql`${table.width} > 0`),
  check("sillage_theme_image_height_positive", sql`${table.height} > 0`),
]);

export const sillageEventThemes = pgTable("sillage_event_themes", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => sillageEvents.id, { onDelete: "cascade" }),
  mode: text("mode").notNull().default("studio"),
  imageId: uuid("image_id").references(() => sillageThemeImages.id, {
    onDelete: "restrict",
  }),
  focalX: real("focal_x").notNull().default(50),
  focalY: real("focal_y").notNull().default(50),
  overlay: real("overlay").notNull().default(0.5),
  guestImageConsent: boolean("guest_image_consent").notNull().default(false),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [
  check(
    "sillage_event_theme_mode_valid",
    sql`${table.mode} IN ('studio', 'editorial', 'signature')`,
  ),
  check(
    "sillage_event_theme_focal_x_valid",
    sql`${table.focalX} BETWEEN 0 AND 100`,
  ),
  check(
    "sillage_event_theme_focal_y_valid",
    sql`${table.focalY} BETWEEN 0 AND 100`,
  ),
  check(
    "sillage_event_theme_overlay_valid",
    sql`${table.overlay} BETWEEN 0 AND 1`,
  ),
  check("sillage_event_theme_revision_valid", sql`${table.revision} > 0`),
]);

export type SillageThemeImage = typeof sillageThemeImages.$inferSelect;
export type SillageEventTheme = typeof sillageEventThemes.$inferSelect;
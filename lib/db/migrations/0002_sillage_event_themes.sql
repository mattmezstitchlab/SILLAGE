CREATE TABLE IF NOT EXISTS "sillage_theme_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "sillage_events" ("id") ON DELETE CASCADE,
  "owner_id" text NOT NULL,
  "object_path" text NOT NULL UNIQUE,
  "mime_type" text NOT NULL,
  "byte_size" integer NOT NULL CHECK ("byte_size" > 0),
  "width" integer NOT NULL CHECK ("width" > 0),
  "height" integer NOT NULL CHECK ("height" > 0),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sillage_theme_images_event_idx"
  ON "sillage_theme_images" ("event_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sillage_event_themes" (
  "event_id" uuid PRIMARY KEY REFERENCES "sillage_events" ("id") ON DELETE CASCADE,
  "mode" text DEFAULT 'studio' NOT NULL
    CHECK ("mode" IN ('studio', 'editorial', 'signature')),
  "image_id" uuid REFERENCES "sillage_theme_images" ("id") ON DELETE RESTRICT,
  "focal_x" real DEFAULT 50 NOT NULL CHECK ("focal_x" BETWEEN 0 AND 100),
  "focal_y" real DEFAULT 50 NOT NULL CHECK ("focal_y" BETWEEN 0 AND 100),
  "overlay" real DEFAULT 0.5 NOT NULL CHECK ("overlay" BETWEEN 0 AND 1),
  "guest_image_consent" boolean DEFAULT false NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL CHECK ("revision" > 0),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
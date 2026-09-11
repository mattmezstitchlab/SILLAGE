CREATE TABLE IF NOT EXISTS "sillage_dj_transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "event_name_snapshot" text NOT NULL,
  "owner_id" text NOT NULL,
  "recipient_email" text NOT NULL,
  "recipient_user_id" text,
  "bound_at" timestamp with time zone,
  "rights_confirmed_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sillage_dj_transfers_event_idx"
  ON "sillage_dj_transfers" ("event_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sillage_dj_transfers_recipient_email_idx"
  ON "sillage_dj_transfers" ("recipient_email", "recipient_user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sillage_dj_transfer_tracks" (
  "transfer_id" uuid NOT NULL,
  "track_id" uuid NOT NULL,
  "title_snapshot" text NOT NULL,
  "artist_snapshot" text NOT NULL,
  "album_snapshot" text NOT NULL,
  "position" integer NOT NULL,
  "object_path_snapshot" text NOT NULL,
  "mime_type_snapshot" text NOT NULL,
  "byte_size_snapshot" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("transfer_id", "track_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sillage_dj_transfer_tracks_track_idx"
  ON "sillage_dj_transfer_tracks" ("track_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sillage_dj_transfer_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "transfer_id" uuid NOT NULL,
  "track_id" uuid,
  "title_snapshot" text,
  "user_id" text,
  "recipient_email" text,
  "status" text NOT NULL,
  "failure_reason" text,
  "bytes_transferred" integer DEFAULT 0 NOT NULL,
  "server_transfer_completed" boolean DEFAULT false NOT NULL,
  "initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sillage_dj_transfer_attempts_transfer_idx"
  ON "sillage_dj_transfer_attempts" ("transfer_id", "initiated_at");
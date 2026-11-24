CREATE TABLE IF NOT EXISTS "library_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"external_key" text NOT NULL,
	"title" text NOT NULL,
	"steam_app_id" text,
	"cover_url" text,
	"installed" boolean DEFAULT false NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"total_seconds" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_entries_user_id_external_key_pk" PRIMARY KEY("user_id","external_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_entries_user_idx" ON "library_entries" ("user_id");

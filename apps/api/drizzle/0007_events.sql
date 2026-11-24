CREATE TABLE IF NOT EXISTS "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clan_id" uuid,
	"title" text NOT NULL,
	"description" text NOT NULL DEFAULT '',
	"starts_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"host_id" uuid NOT NULL,
	"going_count" integer DEFAULT 0 NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_participants" (
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_participants_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_starts_at_idx" ON "events" ("starts_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_participants_event_idx" ON "event_participants" ("event_id");

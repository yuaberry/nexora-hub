CREATE TABLE IF NOT EXISTS "user_cosmetics" (
	"user_id" uuid NOT NULL,
	"cosmetic_id" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_cosmetics_user_id_cosmetic_id_pk" PRIMARY KEY("user_id","cosmetic_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_cosmetic_equipped" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"cosmetic_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_cosmetic_equipped_user_id_kind_pk" PRIMARY KEY("user_id","kind")
);
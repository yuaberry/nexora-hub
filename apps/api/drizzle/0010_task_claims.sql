CREATE TABLE IF NOT EXISTS "task_claims" (
	"user_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"period_key" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_claims_user_id_task_id_period_key_pk" PRIMARY KEY("user_id","task_id","period_key")
);

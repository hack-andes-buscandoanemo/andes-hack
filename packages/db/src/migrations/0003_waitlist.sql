CREATE TYPE "public"."waitlist_kind" AS ENUM('institution', 'individual');--> statement-breakpoint
CREATE TABLE "waitlist_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "waitlist_kind" NOT NULL,
	"institution" text NOT NULL,
	"role" text,
	"on_site_count" integer,
	"wants_pilot" boolean,
	"email" text NOT NULL,
	"consent" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entry_kind_email_idx" ON "waitlist_entry" USING btree ("kind","email");
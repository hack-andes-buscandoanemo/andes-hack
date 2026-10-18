CREATE TYPE "public"."incident_report_status" AS ENUM('open', 'reviewed');--> statement-breakpoint
CREATE TYPE "public"."incident_report_type" AS ENUM('harassment', 'dangerous_driving', 'no_show', 'inappropriate_behavior', 'other');--> statement-breakpoint
CREATE TABLE "incident_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"reporter_id" text,
	"reported_user_id" text,
	"message_id" uuid,
	"type" "incident_report_type" NOT NULL,
	"description" varchar(1000),
	"status" "incident_report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incident_report" ADD CONSTRAINT "incident_report_community_id_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_report" ADD CONSTRAINT "incident_report_offer_id_trip_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."trip_offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_report" ADD CONSTRAINT "incident_report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_report" ADD CONSTRAINT "incident_report_reported_user_id_user_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_report" ADD CONSTRAINT "incident_report_message_id_trip_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."trip_message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incident_report_community_created_idx" ON "incident_report" USING btree ("community_id","created_at");
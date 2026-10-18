CREATE TYPE "public"."match_algorithm" AS ENUM('fcfs', 'optimizer');--> statement-breakpoint
CREATE TYPE "public"."match_suggestion_status" AS ENUM('proposed', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "match_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"direction" "trip_direction" NOT NULL,
	"date" date NOT NULL,
	"algorithm" "match_algorithm" NOT NULL,
	"input_summary" jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"duration_ms" integer NOT NULL,
	"run_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_suggestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"passenger_id" text,
	"meeting_point_id" text NOT NULL,
	"position" smallint NOT NULL,
	"pickup_at" time NOT NULL,
	"arrival_at" time NOT NULL,
	"detour_minutes" smallint NOT NULL,
	"walk_minutes" smallint NOT NULL,
	"avoids_car_trip" boolean NOT NULL,
	"status" "match_suggestion_status" DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_suggestion_run_id_request_id_unique" UNIQUE("run_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "match_run" ADD CONSTRAINT "match_run_community_id_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_run" ADD CONSTRAINT "match_run_run_by_user_id_fk" FOREIGN KEY ("run_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_suggestion" ADD CONSTRAINT "match_suggestion_run_id_match_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."match_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_suggestion" ADD CONSTRAINT "match_suggestion_offer_id_trip_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."trip_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_suggestion" ADD CONSTRAINT "match_suggestion_request_id_trip_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."trip_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_suggestion" ADD CONSTRAINT "match_suggestion_passenger_id_user_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_suggestion" ADD CONSTRAINT "match_suggestion_meeting_point_id_meeting_point_id_fk" FOREIGN KEY ("meeting_point_id") REFERENCES "public"."meeting_point"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_run_journey_idx" ON "match_run" USING btree ("community_id","direction","date");--> statement-breakpoint
CREATE INDEX "match_suggestion_offer_id_idx" ON "match_suggestion" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "match_suggestion_passenger_id_idx" ON "match_suggestion" USING btree ("passenger_id");
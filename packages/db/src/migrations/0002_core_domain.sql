CREATE TYPE "public"."community_kind" AS ENUM('company', 'university', 'public_entity', 'event');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('member', 'admin');--> statement-breakpoint
CREATE TYPE "public"."travel_role" AS ENUM('driver', 'passenger', 'both');--> statement-breakpoint
CREATE TYPE "public"."usual_mode" AS ENUM('drove_alone', 'drove_with_others', 'car_passenger', 'public_transport', 'taxi_app', 'other');--> statement-breakpoint
CREATE TYPE "public"."verification_method" AS ENUM('join_code', 'email_domain');--> statement-breakpoint
CREATE TYPE "public"."meeting_point_kind" AS ENUM('park', 'mall', 'rail_station', 'bus_stop', 'venue', 'other');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'accepted', 'rejected', 'cancelled_by_passenger', 'cancelled_by_driver', 'completed', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."fallback_mode" AS ENUM('drive_alone', 'taxi_app', 'public_transport', 'picked_up', 'other');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('active', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('open', 'matched', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."trip_direction" AS ENUM('outbound', 'return');--> statement-breakpoint
CREATE TABLE "community" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "community_kind" NOT NULL,
	"destination_name" text NOT NULL,
	"destination_lat" double precision NOT NULL,
	"destination_lng" double precision NOT NULL,
	"allowed_email_domains" text[] DEFAULT '{}' NOT NULL,
	"join_code_hash" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"verification_method" "verification_method" NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"alias" text,
	"usual_mode" "usual_mode",
	"travel_role" "travel_role",
	"identifies_as_woman" boolean DEFAULT false NOT NULL,
	"women_only" boolean DEFAULT false NOT NULL,
	"is_team" boolean DEFAULT false NOT NULL,
	"consent_version" text,
	"consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_point" (
	"id" text PRIMARY KEY NOT NULL,
	"zone_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "meeting_point_kind" NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zone" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"district" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seat_booking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"passenger_id" text,
	"meeting_point_id" text NOT NULL,
	"pickup_at" time NOT NULL,
	"detour_minutes" smallint NOT NULL,
	"walk_minutes" smallint NOT NULL,
	"message" varchar(280),
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_offer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"driver_id" text,
	"vehicle_id" uuid,
	"direction" "trip_direction" NOT NULL,
	"origin_zone_id" text NOT NULL,
	"departure_time" time NOT NULL,
	"days_of_week" smallint[],
	"date" date,
	"seats_total" smallint NOT NULL,
	"seats_taken" smallint DEFAULT 0 NOT NULL,
	"max_detour_minutes" smallint NOT NULL,
	"women_only" boolean DEFAULT false NOT NULL,
	"note" varchar(280),
	"status" "offer_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_offer_seats_taken_check" CHECK ("trip_offer"."seats_taken" BETWEEN 0 AND "trip_offer"."seats_total")
);
--> statement-breakpoint
CREATE TABLE "trip_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"passenger_id" text,
	"direction" "trip_direction" NOT NULL,
	"origin_zone_id" text NOT NULL,
	"window_start" time NOT NULL,
	"window_end" time NOT NULL,
	"days_of_week" smallint[],
	"date" date,
	"max_walk_minutes" smallint NOT NULL,
	"fallback_mode" "fallback_mode" NOT NULL,
	"status" "request_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"plate" text NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"color" text NOT NULL,
	"seats" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_member" ADD CONSTRAINT "community_member_community_id_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_member" ADD CONSTRAINT "community_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_point" ADD CONSTRAINT "meeting_point_zone_id_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_booking" ADD CONSTRAINT "seat_booking_offer_id_trip_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."trip_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_booking" ADD CONSTRAINT "seat_booking_request_id_trip_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."trip_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_booking" ADD CONSTRAINT "seat_booking_passenger_id_user_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_booking" ADD CONSTRAINT "seat_booking_meeting_point_id_meeting_point_id_fk" FOREIGN KEY ("meeting_point_id") REFERENCES "public"."meeting_point"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_offer" ADD CONSTRAINT "trip_offer_community_id_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_offer" ADD CONSTRAINT "trip_offer_driver_id_user_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_offer" ADD CONSTRAINT "trip_offer_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_offer" ADD CONSTRAINT "trip_offer_origin_zone_id_zone_id_fk" FOREIGN KEY ("origin_zone_id") REFERENCES "public"."zone"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_request" ADD CONSTRAINT "trip_request_community_id_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_request" ADD CONSTRAINT "trip_request_passenger_id_user_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_request" ADD CONSTRAINT "trip_request_origin_zone_id_zone_id_fk" FOREIGN KEY ("origin_zone_id") REFERENCES "public"."zone"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_member_user_id_idx" ON "community_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "seat_booking_offer_id_idx" ON "seat_booking" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "seat_booking_passenger_id_idx" ON "seat_booking" USING btree ("passenger_id");--> statement-breakpoint
CREATE INDEX "trip_offer_community_id_idx" ON "trip_offer" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "trip_offer_driver_id_idx" ON "trip_offer" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "trip_request_community_id_idx" ON "trip_request" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "trip_request_passenger_id_idx" ON "trip_request" USING btree ("passenger_id");--> statement-breakpoint
CREATE INDEX "vehicle_owner_id_idx" ON "vehicle" USING btree ("owner_id");
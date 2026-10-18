ALTER TABLE "seat_booking" ALTER COLUMN "meeting_point_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "seat_booking" ADD COLUMN "pickup_lat" double precision;--> statement-breakpoint
ALTER TABLE "seat_booking" ADD COLUMN "pickup_lng" double precision;--> statement-breakpoint
ALTER TABLE "seat_booking" ADD COLUMN "pickup_label" varchar(160);--> statement-breakpoint
ALTER TABLE "seat_booking" ADD COLUMN "dropoff_lat" double precision;--> statement-breakpoint
ALTER TABLE "seat_booking" ADD COLUMN "dropoff_lng" double precision;--> statement-breakpoint
ALTER TABLE "seat_booking" ADD COLUMN "dropoff_label" varchar(160);--> statement-breakpoint
ALTER TABLE "trip_offer" ADD COLUMN "origin_lat" double precision;--> statement-breakpoint
ALTER TABLE "trip_offer" ADD COLUMN "origin_lng" double precision;--> statement-breakpoint
ALTER TABLE "trip_offer" ADD COLUMN "origin_label" varchar(160);--> statement-breakpoint
ALTER TABLE "trip_offer" ADD COLUMN "dest_lat" double precision;--> statement-breakpoint
ALTER TABLE "trip_offer" ADD COLUMN "dest_lng" double precision;--> statement-breakpoint
ALTER TABLE "trip_offer" ADD COLUMN "dest_label" varchar(160);--> statement-breakpoint
ALTER TABLE "trip_offer" ADD COLUMN "route_path" jsonb;--> statement-breakpoint
ALTER TABLE "trip_offer" ADD COLUMN "route_minutes" smallint;--> statement-breakpoint
ALTER TABLE "trip_offer" ADD COLUMN "route_km" real;--> statement-breakpoint
ALTER TABLE "trip_offer" ADD COLUMN "route_approximate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_request" ADD COLUMN "origin_lat" double precision;--> statement-breakpoint
ALTER TABLE "trip_request" ADD COLUMN "origin_lng" double precision;--> statement-breakpoint
ALTER TABLE "trip_request" ADD COLUMN "origin_label" varchar(160);--> statement-breakpoint
ALTER TABLE "trip_request" ADD COLUMN "dest_lat" double precision;--> statement-breakpoint
ALTER TABLE "trip_request" ADD COLUMN "dest_lng" double precision;--> statement-breakpoint
ALTER TABLE "trip_request" ADD COLUMN "dest_label" varchar(160);--> statement-breakpoint
ALTER TABLE "seat_booking" ADD CONSTRAINT "seat_booking_pickup_check" CHECK ("seat_booking"."meeting_point_id" IS NOT NULL OR ("seat_booking"."pickup_lat" IS NOT NULL AND "seat_booking"."pickup_lng" IS NOT NULL));
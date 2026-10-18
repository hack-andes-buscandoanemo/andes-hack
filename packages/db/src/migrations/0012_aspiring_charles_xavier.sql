CREATE TYPE "public"."payment_method" AS ENUM('yape', 'cash');--> statement-breakpoint
CREATE TABLE "trip_live_location" (
	"offer_id" uuid PRIMARY KEY NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip_offer" ADD COLUMN "price_cents" integer;--> statement-breakpoint
ALTER TABLE "trip_offer" ADD COLUMN "payment_methods" "payment_method"[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_offer" ADD COLUMN "live_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_live_location" ADD CONSTRAINT "trip_live_location_offer_id_trip_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."trip_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_offer" ADD CONSTRAINT "trip_offer_price_cents_check" CHECK ("trip_offer"."price_cents" IS NULL OR "trip_offer"."price_cents" BETWEEN 0 AND 20000);
CREATE TYPE "public"."trip_day_outcome" AS ENUM('completed', 'no_show');--> statement-breakpoint
CREATE TABLE "seat_booking_day" (
	"booking_id" uuid NOT NULL,
	"trip_date" date NOT NULL,
	"started_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"outcome" "trip_day_outcome",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seat_booking_day_booking_id_trip_date_pk" PRIMARY KEY("booking_id","trip_date"),
	CONSTRAINT "seat_booking_day_completed_check" CHECK (COALESCE("seat_booking_day"."outcome" = 'completed', false) = ("seat_booking_day"."arrived_at" IS NOT NULL)
        AND ("seat_booking_day"."outcome" IS DISTINCT FROM 'completed' OR "seat_booking_day"."started_at" IS NOT NULL)),
	CONSTRAINT "seat_booking_day_no_show_check" CHECK ("seat_booking_day"."outcome" IS DISTINCT FROM 'no_show' OR "seat_booking_day"."started_at" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "seat_booking_day" ADD CONSTRAINT "seat_booking_day_booking_id_seat_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."seat_booking"("id") ON DELETE cascade ON UPDATE no action;
CREATE TYPE "public"."trip_message_kind" AS ENUM('text', 'quick');--> statement-breakpoint
CREATE TABLE "trip_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"sender_id" text NOT NULL,
	"kind" "trip_message_kind" DEFAULT 'text' NOT NULL,
	"body" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "seat_booking_active_passenger_idx";--> statement-breakpoint
ALTER TABLE "seat_booking" ADD COLUMN "passenger_was_team" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_offer" ADD COLUMN "driver_was_team" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_message" ADD CONSTRAINT "trip_message_offer_id_trip_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."trip_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_message" ADD CONSTRAINT "trip_message_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_message_offer_created_idx" ON "trip_message" USING btree ("offer_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "seat_booking_active_passenger_idx" ON "seat_booking" USING btree ("offer_id","passenger_id") WHERE "seat_booking"."status" IN ('pending', 'accepted', 'rejected');--> statement-breakpoint
UPDATE public.trip_offer AS offer
SET driver_was_team = member.is_team
FROM public.community_member AS member
WHERE offer.driver_id = member.user_id AND offer.community_id = member.community_id;
--> statement-breakpoint
UPDATE public.seat_booking AS booking
SET passenger_was_team = member.is_team
FROM public.community_member AS member
JOIN public.trip_offer AS offer ON offer.community_id = member.community_id
WHERE booking.passenger_id = member.user_id AND booking.offer_id = offer.id;
--> statement-breakpoint--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.delete_personal_data(target_user_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.trip_offer AS offer
  SET driver_was_team = member.is_team
  FROM public.community_member AS member
  WHERE offer.driver_id = target_user_id
    AND member.user_id = target_user_id
    AND member.community_id = offer.community_id;

  UPDATE public.seat_booking AS booking
  SET passenger_was_team = member.is_team
  FROM public.community_member AS member
  WHERE booking.passenger_id = target_user_id
    AND member.user_id = target_user_id
    AND EXISTS (
      SELECT 1
      FROM public.trip_offer AS offer
      WHERE offer.id = booking.offer_id AND offer.community_id = member.community_id
    );

  UPDATE public.trip_offer AS offer
  SET seats_taken = greatest(offer.seats_taken - accepted.seats_to_release, 0)
  FROM (
    SELECT offer_id, count(*) AS seats_to_release
    FROM public.seat_booking
    WHERE passenger_id = target_user_id AND status = 'accepted'
    GROUP BY offer_id
  ) AS accepted
  WHERE offer.id = accepted.offer_id;

  DELETE FROM public.seat_booking
  WHERE passenger_id = target_user_id AND status NOT IN ('completed', 'no_show');

  DELETE FROM public.seat_booking AS booking
  USING public.trip_offer AS offer
  WHERE booking.offer_id = offer.id
    AND offer.driver_id = target_user_id
    AND booking.status NOT IN ('accepted', 'completed', 'no_show');

  UPDATE public.seat_booking AS booking
  SET message = NULL
  FROM public.trip_offer AS offer
  WHERE booking.offer_id = offer.id AND offer.driver_id = target_user_id;

  UPDATE public.trip_offer AS offer
  SET driver_id = NULL, vehicle_id = NULL, status = 'cancelled', note = NULL
  WHERE offer.driver_id = target_user_id
    AND EXISTS (
      SELECT 1 FROM public.seat_booking AS booking WHERE booking.offer_id = offer.id
    );

  DELETE FROM public.trip_offer AS offer
  WHERE offer.driver_id = target_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.seat_booking AS booking WHERE booking.offer_id = offer.id
    );

  UPDATE public.trip_request AS request
  SET passenger_id = NULL, status = 'cancelled'
  WHERE request.passenger_id = target_user_id
    AND EXISTS (
      SELECT 1 FROM public.seat_booking AS booking WHERE booking.request_id = request.id
    );

  DELETE FROM public.trip_request AS request
  WHERE request.passenger_id = target_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.seat_booking AS booking WHERE booking.request_id = request.id
    );

  DELETE FROM public."user" WHERE id = target_user_id;
END;
$$;

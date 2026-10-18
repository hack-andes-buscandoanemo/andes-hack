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

  DELETE FROM public.seat_booking AS booking
  WHERE passenger_id = target_user_id AND status NOT IN ('completed', 'no_show')
    AND NOT EXISTS (
      SELECT 1 FROM public.seat_booking_day AS day
      WHERE day.booking_id = booking.id AND day.outcome IS NOT NULL
    );

  UPDATE public.seat_booking
  SET passenger_id = NULL, message = NULL,
      status = CASE WHEN status IN ('pending', 'accepted')
        THEN 'cancelled_by_passenger'::booking_status ELSE status END
  WHERE passenger_id = target_user_id;

  DELETE FROM public.seat_booking AS booking
  USING public.trip_offer AS offer
  WHERE booking.offer_id = offer.id
    AND offer.driver_id = target_user_id
    AND booking.status NOT IN ('accepted', 'completed', 'no_show')
    AND NOT EXISTS (
      SELECT 1 FROM public.seat_booking_day AS day
      WHERE day.booking_id = booking.id AND day.outcome IS NOT NULL
    );

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


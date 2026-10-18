import type { db as defaultDb } from "@andes-hack/db";
import { seatBooking, tripOffer } from "@andes-hack/db/schema/trips";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { limaClock, runsOn, secondsOfDay } from "./trip-rules";
import { ApiError } from "./utils/api-response";

type Database = typeof defaultDb;

const START_OPENS_MINUTES_BEFORE = 30;
const NO_SHOW_OPENS_MINUTES_AFTER = 10;
const NO_SHOW_MESSAGE = "Registramos que la persona no se presentó.";

type Offer = {
  status: "active" | "paused" | "cancelled";
  date: string | null;
  daysOfWeek: number[] | null;
  departureTime: string;
};

// The trip can start from 30 minutes before departure, on a day it actually runs.
function assertCanStart(offer: Offer, now: Date) {
  const clock = limaClock(now);
  if (offer.status === "cancelled") {
    throw new ApiError(409, "Este viaje fue cancelado.", { code: "trip_cancelled" });
  }
  if (!runsOn(offer, clock.today)) {
    throw new ApiError(409, "Este viaje no es para hoy.", { code: "trip_not_today" });
  }
  const opensAt = secondsOfDay(offer.departureTime) - START_OPENS_MINUTES_BEFORE * 60;
  if (secondsOfDay(clock.time) < opensAt) {
    throw new ApiError(409, "Podrás iniciar el viaje 30 minutos antes de la salida.", {
      code: "trip_too_early",
    });
  }
}

export async function startTrip(
  database: Database,
  input: { offerId: string; userId: string; now: Date },
) {
  const [offer] = await database
    .select({
      id: tripOffer.id,
      driverId: tripOffer.driverId,
      departureTime: tripOffer.departureTime,
      status: tripOffer.status,
      date: tripOffer.date,
      daysOfWeek: tripOffer.daysOfWeek,
    })
    .from(tripOffer)
    .where(eq(tripOffer.id, input.offerId))
    .limit(1);
  if (!offer) {
    throw new ApiError(404, "No encontramos este viaje.", { code: "offer_not_found" });
  }
  if (offer.driverId !== input.userId) {
    throw new ApiError(403, "Solo quien conduce puede iniciar este viaje.", {
      code: "driver_required",
    });
  }
  assertCanStart(offer, input.now);
  await database
    .update(seatBooking)
    .set({ startedAt: input.now })
    .where(
      and(
        eq(seatBooking.offerId, offer.id),
        eq(seatBooking.status, "accepted"),
        isNull(seatBooking.startedAt),
      ),
    );
  // Starting again changes nothing: the first moment stays and the answer is the same.
  const aboard = await database
    .select({ startedAt: seatBooking.startedAt })
    .from(seatBooking)
    .where(
      and(
        eq(seatBooking.offerId, offer.id),
        inArray(seatBooking.status, ["accepted", "completed"]),
        isNotNull(seatBooking.startedAt),
      ),
    );
  const first = Math.min(...aboard.map((row) => row.startedAt!.getTime()));
  return {
    startedAt: new Date(aboard.length > 0 ? first : input.now.getTime()).toISOString(),
    boarded: aboard.length,
    message: "Viaje en curso.",
  };
}

async function bookingView(database: Database, bookingId: string) {
  const [row] = await database
    .select({
      id: seatBooking.id,
      status: seatBooking.status,
      startedAt: seatBooking.startedAt,
      arrivedAt: seatBooking.arrivedAt,
    })
    .from(seatBooking)
    .where(eq(seatBooking.id, bookingId))
    .limit(1);
  return {
    id: row!.id,
    status: row!.status,
    startedAt: row!.startedAt?.toISOString() ?? null,
    arrivedAt: row!.arrivedAt?.toISOString() ?? null,
  };
}

export async function boardTrip(
  database: Database,
  input: { bookingId: string; userId: string; now: Date },
) {
  const [mine] = await database
    .select({
      id: seatBooking.id,
      status: seatBooking.status,
      startedAt: seatBooking.startedAt,
      offer: {
        status: tripOffer.status,
        date: tripOffer.date,
        daysOfWeek: tripOffer.daysOfWeek,
        departureTime: tripOffer.departureTime,
      },
    })
    .from(seatBooking)
    .innerJoin(tripOffer, eq(seatBooking.offerId, tripOffer.id))
    .where(and(eq(seatBooking.id, input.bookingId), eq(seatBooking.passengerId, input.userId)))
    .limit(1);
  if (!mine) {
    throw new ApiError(404, "No encontramos esta reserva.", { code: "booking_not_found" });
  }
  if (mine.status !== "accepted" && mine.status !== "completed") {
    throw new ApiError(409, "Solo puedes marcar el viaje si tu asiento está confirmado.", {
      code: "booking_not_accepted",
    });
  }
  // Boarding again changes nothing: the first moment stays.
  if (mine.startedAt)
    return { booking: await bookingView(database, mine.id), message: "Viaje en curso." };
  assertCanStart(mine.offer, input.now);
  await database
    .update(seatBooking)
    .set({ startedAt: input.now })
    .where(
      and(
        eq(seatBooking.id, mine.id),
        eq(seatBooking.status, "accepted"),
        isNull(seatBooking.startedAt),
      ),
    );
  return { booking: await bookingView(database, mine.id), message: "Viaje en curso." };
}

export async function arriveTrip(
  database: Database,
  input: { bookingId: string; userId: string; now: Date },
) {
  const [mine] = await database
    .select({ id: seatBooking.id, status: seatBooking.status, startedAt: seatBooking.startedAt })
    .from(seatBooking)
    .where(and(eq(seatBooking.id, input.bookingId), eq(seatBooking.passengerId, input.userId)))
    .limit(1);
  if (!mine) {
    throw new ApiError(404, "No encontramos esta reserva.", { code: "booking_not_found" });
  }
  if (mine.status !== "accepted" && mine.status !== "completed") {
    throw new ApiError(409, "Solo puedes marcar el viaje si tu asiento está confirmado.", {
      code: "booking_not_accepted",
    });
  }
  if (mine.status === "accepted" && !mine.startedAt) {
    throw new ApiError(409, "El viaje todavía no empezó.", { code: "trip_not_started" });
  }
  // Conditional update, since the Neon HTTP driver has no transactions: a cancellation that
  // lands in between wins and this one changes nothing.
  await database
    .update(seatBooking)
    .set({ status: "completed", arrivedAt: input.now })
    .where(
      and(
        eq(seatBooking.id, mine.id),
        eq(seatBooking.status, "accepted"),
        isNotNull(seatBooking.startedAt),
      ),
    );
  const booking = await bookingView(database, mine.id);
  if (booking.status !== "completed") {
    throw new ApiError(409, "Solo puedes marcar el viaje si tu asiento está confirmado.", {
      code: "booking_not_accepted",
    });
  }
  return { booking, message: "Llegada confirmada. ¡Gracias por compartir el viaje!" };
}

export async function markNoShow(
  database: Database,
  input: { bookingId: string; userId: string; now: Date },
) {
  const [mine] = await database
    .select({
      id: seatBooking.id,
      pickupAt: seatBooking.pickupAt,
      driverId: tripOffer.driverId,
      status: seatBooking.status,
      startedAt: seatBooking.startedAt,
    })
    .from(seatBooking)
    .innerJoin(tripOffer, eq(seatBooking.offerId, tripOffer.id))
    .where(eq(seatBooking.id, input.bookingId))
    .limit(1);
  if (!mine) {
    throw new ApiError(404, "No encontramos esta reserva.", { code: "booking_not_found" });
  }
  if (mine.driverId !== input.userId) {
    throw new ApiError(403, "Solo quien conduce puede marcar que alguien no se presentó.", {
      code: "driver_required",
    });
  }
  if (mine.status === "no_show")
    return { booking: await bookingView(database, mine.id), message: NO_SHOW_MESSAGE };
  if (mine.status !== "accepted") {
    throw new ApiError(409, "Solo puedes marcar el viaje si el asiento está confirmado.", {
      code: "booking_not_accepted",
    });
  }
  if (mine.startedAt) {
    throw new ApiError(409, "Esta persona ya está en el viaje.", {
      code: "booking_already_started",
    });
  }
  const opensAt = secondsOfDay(mine.pickupAt) + NO_SHOW_OPENS_MINUTES_AFTER * 60;
  if (secondsOfDay(limaClock(input.now).time) < opensAt) {
    throw new ApiError(
      409,
      "Podrás marcar que no se presentó 10 minutos después de la hora de recogida.",
      { code: "no_show_too_early" },
    );
  }
  await database
    .update(seatBooking)
    .set({ status: "no_show" })
    .where(
      and(
        eq(seatBooking.id, mine.id),
        eq(seatBooking.status, "accepted"),
        isNull(seatBooking.startedAt),
      ),
    );
  // A boarding that lands in between wins: the person is in the car after all.
  const booking = await bookingView(database, mine.id);
  if (booking.status !== "no_show") {
    throw new ApiError(409, "Esta persona ya está en el viaje.", {
      code: "booking_already_started",
    });
  }
  return { booking, message: NO_SHOW_MESSAGE };
}

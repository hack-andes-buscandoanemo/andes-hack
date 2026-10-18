import type { db as defaultDb } from "@andes-hack/db";
import { seatBooking, seatBookingDay, tripOffer } from "@andes-hack/db/schema/trips";
import { and, desc, eq, exists, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";

import {
  addDays,
  BOOKING,
  endOfLimaDay,
  limaClock,
  limaInstant,
  runsOn,
  secondsOfDay,
} from "./trip-rules";
import { ApiError } from "./utils/api-response";

type Database = typeof defaultDb;
type Outcome = "completed" | "no_show";

const START_OPENS_MINUTES_BEFORE = 30;
const NO_SHOW_OPENS_MINUTES_AFTER = 10;
const MINUTE_MS = 60 * 1000;
const NO_SHOW_MESSAGE = "Registramos que la persona no se presentó.";
const NOT_CONFIRMED_MESSAGE = "Solo puedes marcar el viaje si tu asiento está confirmado.";

// Progress is kept per booking and Lima trip date (seat_booking_day), because a weekly seat is
// reused every week: week 2 starts from scratch and week 1 stays as it ended. The booking
// itself stays `accepted`. Neon's HTTP driver has no transactions, so every write is one
// statement that guards itself (INSERT ... SELECT ... ON CONFLICT ... DO UPDATE ... WHERE),
// and the answer always comes from the row that is stored afterwards, never from a hope.

type Offer = {
  status: "active" | "paused" | "cancelled";
  date: string | null;
  daysOfWeek: number[] | null;
  departureTime: string;
};

const notFound = () =>
  new ApiError(404, "No encontramos esta reserva.", {
    code: "booking_not_found",
  });
const notConfirmed = (message = NOT_CONFIRMED_MESSAGE) =>
  new ApiError(409, message, { code: "booking_not_accepted" });

// The trip date a start / board belongs to: the trip opens 30 minutes before departure and
// closes at the end of its Lima day. A trip leaving just after midnight opens the evening
// before, so tomorrow's occurrence is a candidate too. When two are open, the later one wins.
function openTripDate(offer: Offer, now: Date) {
  if (offer.status === "cancelled") {
    throw new ApiError(409, "Este viaje fue cancelado.", {
      code: "trip_cancelled",
    });
  }
  const { today } = limaClock(now);
  const opensBeforeMidnight = secondsOfDay(offer.departureTime) < START_OPENS_MINUTES_BEFORE * 60;
  const running = (opensBeforeMidnight ? [today, addDays(today, 1)] : [today]).filter((day) =>
    runsOn(offer, day),
  );
  if (running.length === 0) {
    throw new ApiError(409, "Este viaje no es para hoy.", {
      code: "trip_not_today",
    });
  }
  const open = running.filter(
    (day) =>
      now.getTime() >=
        limaInstant(day, offer.departureTime).getTime() - START_OPENS_MINUTES_BEFORE * MINUTE_MS &&
      now < endOfLimaDay(day),
  );
  if (open.length === 0) {
    throw new ApiError(409, "Podrás iniciar el viaje 30 minutos antes de la salida.", {
      code: "trip_too_early",
    });
  }
  return open[open.length - 1]!;
}

// A started day older than yesterday was abandoned; it can no longer be closed.
const liveRange = (today: string) => [addDays(today, -1), addDays(today, 1)] as const;

const dayKey = (bookingId: string, tripDate: string) =>
  and(eq(seatBookingDay.bookingId, bookingId), eq(seatBookingDay.tripDate, tripDate));

async function readDay(database: Database, bookingId: string, tripDate: string) {
  const [row] = await database
    .select()
    .from(seatBookingDay)
    .where(dayKey(bookingId, tripDate))
    .limit(1);
  return row;
}

const dayView = (row: typeof seatBookingDay.$inferSelect) => ({
  id: row.bookingId,
  tripDate: row.tripDate,
  startedAt: row.startedAt?.toISOString() ?? null,
  arrivedAt: row.arrivedAt?.toISOString() ?? null,
  outcome: row.outcome,
});

// The accepted seats matching `where`, shaped as new rows of the day. Cancelled or pending
// seats select nothing, so a race with a cancellation writes nothing.
function acceptedSeatsAsDay(
  database: Database,
  where: ReturnType<typeof eq>,
  day: { tripDate: string; startedAt: Date | null; outcome: Outcome | null },
) {
  return database
    .select({
      bookingId: seatBooking.id,
      tripDate: sql<string>`${day.tripDate}::date`.as("trip_date"),
      startedAt: sql<Date | null>`${day.startedAt?.toISOString() ?? null}::timestamptz`.as(
        "started_at",
      ),
      arrivedAt: sql<Date | null>`null::timestamptz`.as("arrived_at"),
      outcome: sql<Outcome | null>`${day.outcome}::trip_day_outcome`.as("outcome"),
      createdAt: sql<Date>`now()`.as("created_at"),
      updatedAt: sql<Date>`now()`.as("updated_at"),
    })
    .from(seatBooking)
    .where(and(where, eq(seatBooking.status, BOOKING.accepted)));
}

export async function startTrip(
  database: Database,
  input: { offerId: string; userId: string; now: Date },
) {
  // Someone else's trip looks the same as one that does not exist.
  const [offer] = await database
    .select({
      id: tripOffer.id,
      departureTime: tripOffer.departureTime,
      status: tripOffer.status,
      date: tripOffer.date,
      daysOfWeek: tripOffer.daysOfWeek,
    })
    .from(tripOffer)
    .where(and(eq(tripOffer.id, input.offerId), eq(tripOffer.driverId, input.userId)))
    .limit(1);
  if (!offer) {
    throw new ApiError(404, "No encontramos este viaje.", {
      code: "offer_not_found",
    });
  }
  const tripDate = openTripDate(offer, input.now);
  // Starting again, or after a passenger boarded alone, keeps the first moment.
  await database
    .insert(seatBookingDay)
    .select(
      acceptedSeatsAsDay(database, eq(seatBooking.offerId, offer.id), {
        tripDate,
        startedAt: input.now,
        outcome: null,
      }),
    )
    .onConflictDoNothing();
  const aboard = await database
    .select({ startedAt: seatBookingDay.startedAt })
    .from(seatBookingDay)
    .innerJoin(seatBooking, eq(seatBookingDay.bookingId, seatBooking.id))
    .where(
      and(
        eq(seatBooking.offerId, offer.id),
        eq(seatBooking.status, BOOKING.accepted),
        eq(seatBookingDay.tripDate, tripDate),
        isNotNull(seatBookingDay.startedAt),
      ),
    );
  if (aboard.length === 0) {
    throw new ApiError(409, "Aún no tienes pasajeros aceptados para este viaje.", {
      code: "no_accepted_passengers",
    });
  }
  return {
    tripDate,
    startedAt: new Date(Math.min(...aboard.map((row) => row.startedAt!.getTime()))).toISOString(),
    boarded: aboard.length,
    message: "Viaje en curso.",
  };
}

// The booking of the person acting, with its offer. Anything that is not theirs, or not
// accepted any more, is answered the same way whoever asks.
async function ownBooking(
  database: Database,
  input: { bookingId: string; userId: string },
  as: "passenger" | "driver",
) {
  const [row] = await database
    .select({
      id: seatBooking.id,
      status: seatBooking.status,
      pickupAt: seatBooking.pickupAt,
      offer: {
        status: tripOffer.status,
        date: tripOffer.date,
        daysOfWeek: tripOffer.daysOfWeek,
        departureTime: tripOffer.departureTime,
      },
    })
    .from(seatBooking)
    .innerJoin(tripOffer, eq(seatBooking.offerId, tripOffer.id))
    .where(
      and(
        eq(seatBooking.id, input.bookingId),
        as === "passenger"
          ? eq(seatBooking.passengerId, input.userId)
          : eq(tripOffer.driverId, input.userId),
      ),
    )
    .limit(1);
  if (!row) throw notFound();
  if (row.status !== BOOKING.accepted) throw notConfirmed();
  return row;
}

export async function boardTrip(
  database: Database,
  input: { bookingId: string; userId: string; now: Date },
) {
  const mine = await ownBooking(database, input, "passenger");
  const tripDate = openTripDate(mine.offer, input.now);
  await database
    .insert(seatBookingDay)
    .select(
      acceptedSeatsAsDay(database, eq(seatBooking.id, mine.id), {
        tripDate,
        startedAt: input.now,
        outcome: null,
      }),
    )
    .onConflictDoUpdate({
      target: [seatBookingDay.bookingId, seatBookingDay.tripDate],
      set: { startedAt: input.now },
      setWhere: and(isNull(seatBookingDay.startedAt), isNull(seatBookingDay.outcome)),
    });
  const day = await readDay(database, mine.id, tripDate);
  // Nothing stored means a cancellation got in between; a stored day without a start is a no-show.
  if (!day) throw notConfirmed();
  if (!day.startedAt) {
    throw new ApiError(409, "El conductor registró que no te presentaste a este viaje.", {
      code: "booking_no_show",
    });
  }
  return { booking: dayView(day), message: "Viaje en curso." };
}

export async function arriveTrip(
  database: Database,
  input: { bookingId: string; userId: string; now: Date },
) {
  const mine = await ownBooking(database, input, "passenger");
  const { today } = limaClock(input.now);
  const [from, to] = liveRange(today);
  const live = await database
    .select()
    .from(seatBookingDay)
    .where(
      and(
        eq(seatBookingDay.bookingId, mine.id),
        gte(seatBookingDay.tripDate, from),
        lte(seatBookingDay.tripDate, to),
      ),
    )
    .orderBy(desc(seatBookingDay.tripDate));
  const open = live.find((day) => day.startedAt && !day.outcome);
  // Confirming again changes nothing: today's arrival is answered as it was stored.
  const done = live.find((day) => day.outcome === "completed" && day.tripDate === today);
  if (!open) {
    if (done) return { booking: dayView(done), message: ARRIVED_MESSAGE };
    throw new ApiError(409, "El viaje todavía no empezó.", {
      code: "trip_not_started",
    });
  }
  // A cancellation that lands in between wins: the seat is no longer accepted, so nothing is written.
  await database
    .update(seatBookingDay)
    .set({ arrivedAt: input.now, outcome: "completed" })
    .where(
      and(
        dayKey(mine.id, open.tripDate),
        isNotNull(seatBookingDay.startedAt),
        isNull(seatBookingDay.outcome),
        exists(
          database
            .select({ one: sql`1` })
            .from(seatBooking)
            .where(and(eq(seatBooking.id, mine.id), eq(seatBooking.status, BOOKING.accepted))),
        ),
      ),
    );
  const day = await readDay(database, mine.id, open.tripDate);
  // A double tap lands here too: the twin that lost the race finds the same completed day.
  if (day?.outcome !== "completed") throw notConfirmed();
  return { booking: dayView(day), message: ARRIVED_MESSAGE };
}

const ARRIVED_MESSAGE = "Llegada confirmada. ¡Gracias por compartir el viaje!";

export async function markNoShow(
  database: Database,
  input: { bookingId: string; userId: string; now: Date },
) {
  const mine = await ownBooking(database, input, "driver");
  if (mine.offer.status === "cancelled") {
    throw new ApiError(409, "Este viaje fue cancelado.", {
      code: "trip_cancelled",
    });
  }
  const { today } = limaClock(input.now);
  if (!runsOn(mine.offer, today)) {
    throw new ApiError(409, "Este viaje no es para hoy.", {
      code: "trip_not_today",
    });
  }
  const opensAt =
    limaInstant(today, mine.pickupAt).getTime() + NO_SHOW_OPENS_MINUTES_AFTER * MINUTE_MS;
  if (input.now.getTime() < opensAt) {
    throw new ApiError(
      409,
      "Podrás marcar que no se presentó 10 minutos después de la hora de recogida.",
      { code: "no_show_too_early" },
    );
  }
  await database
    .insert(seatBookingDay)
    .select(
      acceptedSeatsAsDay(database, eq(seatBooking.id, mine.id), {
        tripDate: today,
        startedAt: null,
        outcome: "no_show",
      }),
    )
    .onConflictDoUpdate({
      target: [seatBookingDay.bookingId, seatBookingDay.tripDate],
      set: { outcome: "no_show" },
      setWhere: and(isNull(seatBookingDay.startedAt), isNull(seatBookingDay.outcome)),
    });
  const day = await readDay(database, mine.id, today);
  if (!day) throw notConfirmed("Solo puedes marcar el viaje si el asiento está confirmado.");
  // A boarding that landed first wins: the person is in the car after all.
  if (day.outcome !== "no_show") {
    throw new ApiError(409, "Esta persona ya está en el viaje.", {
      code: "booking_already_started",
    });
  }
  return { booking: dayView(day), message: NO_SHOW_MESSAGE };
}

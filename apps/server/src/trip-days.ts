import type { db as defaultDb } from "@andes-hack/db";
import { seatBookingDay } from "@andes-hack/db/schema/trips";
import { and, inArray, lte } from "drizzle-orm";

import { addDays, BOOKING } from "./trip-rules";

type Database = typeof defaultDb;

type Day = Pick<typeof seatBookingDay.$inferSelect, "tripDate" | "startedAt" | "outcome">;

// The day of the trip a seat is on right now: today's, or one that started and was not closed
// (a trip that left just before midnight). Older started days were abandoned.
export function currentDay(days: readonly Day[], today: string) {
  return days
    .filter(
      (day) =>
        day.tripDate === today ||
        (day.startedAt && !day.outcome && day.tripDate >= addDays(today, -1)),
    )
    .toSorted((a, b) => b.tripDate.localeCompare(a.tripDate))[0];
}

// Where an accepted seat is on its current day (US-025); null while there is no seat to follow.
export function progressOf(status: string, day: Day | undefined) {
  if (status !== BOOKING.accepted || day?.outcome === "no_show") return null;
  if (day?.outcome === "completed") return "arrived" as const;
  return day?.startedAt ? ("in_progress" as const) : ("not_started" as const);
}

export const isUnderway = (day: Day | undefined) => !!day?.startedAt && !day.outcome;

// Every day of these seats that is still live or already closed, one query for all of them.
export async function loadDays(database: Database, bookingIds: string[], today: string) {
  const byBooking = new Map<string, Day[]>();
  if (bookingIds.length === 0) return byBooking;
  const rows = await database
    .select({
      bookingId: seatBookingDay.bookingId,
      tripDate: seatBookingDay.tripDate,
      startedAt: seatBookingDay.startedAt,
      outcome: seatBookingDay.outcome,
    })
    .from(seatBookingDay)
    .where(
      and(
        inArray(seatBookingDay.bookingId, bookingIds),
        lte(seatBookingDay.tripDate, addDays(today, 1)),
      ),
    );
  for (const row of rows)
    byBooking.set(row.bookingId, [...(byBooking.get(row.bookingId) ?? []), row]);
  return byBooking;
}

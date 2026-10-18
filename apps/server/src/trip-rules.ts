import type { SeatBooking } from "@andes-hack/db/schema/trips";

// Rules shared by search, offer detail and "my trips", so they cannot drift apart.

// Lima has no daylight saving time, so UTC-5 all year.
export function limaClock(now = new Date()) {
  const iso = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
  return { today: iso.slice(0, 10), time: iso.slice(11, 19) };
}

const DAY_MS = 24 * 60 * 60 * 1000;

// The Lima calendar date `days` after (or before, if negative) `day`.
export const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);

// The instant a Lima wall-clock moment (`day` + HH:MM[:SS]) happens.
export const limaInstant = (day: string, time: string) =>
  new Date(`${day}T${withSeconds(time)}.000-05:00`);

// Midnight at the end of `day` in Lima.
export const endOfLimaDay = (day: string) => limaInstant(addDays(day, 1), "00:00:00");

// Postgres `time` columns come back as HH:MM:SS, hand-written ones may be HH:MM.
const withSeconds = (time: string) => (time.length === 5 ? `${time}:00` : time);

// Seconds since midnight of a Postgres `time` (HH:MM or HH:MM:SS).
export const secondsOfDay = (time: string) => {
  const [hours = 0, minutes = 0, seconds = 0] = time.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
};

// Whether a one-off trip is today, or a weekly one runs on today's weekday (ISO: 1 = Monday).
export function runsOn(trip: { date: string | null; daysOfWeek: number[] | null }, today: string) {
  if (trip.date) return trip.date === today;
  const isoWeekday = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
  return trip.daysOfWeek?.includes(isoWeekday) ?? false;
}

// A weekly trip never ends by itself; a one-off one ends after its date and time.
export function hasPassed(
  trip: { date: string | null; time: string },
  clock: ReturnType<typeof limaClock>,
) {
  if (!trip.date) return false;
  return (
    trip.date < clock.today ||
    (trip.date === clock.today && withSeconds(trip.time) < withSeconds(clock.time))
  );
}

// The name other people see: the community alias, or the account name when there is none
// (for example because the person left the community).
export const displayName = (alias: string | null, accountName: string) => alias ?? accountName;

// Accepted passengers hold the seats; this is the count the engine, search and detail share.
export const seatsFree = (seatsTotal: number, acceptedCount: number) => seatsTotal - acceptedCount;

// The plate is never revealed once the trip is cancelled, and only to the driver or an accepted passenger.
export function canSeePlate(input: {
  offerStatus: "active" | "paused" | "cancelled";
  isOwn: boolean;
  bookingStatus: string | undefined;
}) {
  return input.offerStatus !== "cancelled" && (input.isOwn || input.bookingStatus === "accepted");
}

// Booking statuses the day-of-trip rules read, typed against the schema enum.
export const BOOKING = {
  pending: "pending",
  accepted: "accepted",
} as const satisfies Record<string, SeatBooking["status"]>;

export type PassengerTripStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "completed"
  | "no_show";

// What the passenger sees for their request. Completed / no_show are only stored values
// until US-025 records attendance.
export function passengerStatus(input: {
  status: string;
  offerStatus: "active" | "paused" | "cancelled";
  passed: boolean;
}): PassengerTripStatus {
  const { status, offerStatus, passed } = input;
  if (status === "cancelled_by_passenger" || status === "cancelled_by_driver") return "cancelled";
  const open = status === "pending" || status === "accepted";
  // A cancelled trip releases everyone who was still waiting or going.
  if (open && offerStatus === "cancelled") return "cancelled";
  // A request nobody answered before the trip left lapsed: closest label is "cancelled".
  if (status === "pending" && passed) return "cancelled";
  return status as PassengerTripStatus;
}

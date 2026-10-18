import type { db as defaultDb } from "@andes-hack/db";
import { user as userTable } from "@andes-hack/db/schema/auth";
import { communityMember } from "@andes-hack/db/schema/community";
import { seatBooking, tripOffer, tripShareLink } from "@andes-hack/db/schema/trips";
import { vehicle } from "@andes-hack/db/schema/vehicle";
import { places } from "@andes-hack/matching";
import { and, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { ApiError } from "./utils/api-response";
import { displayName, limaClock } from "./trip-rules";

type Database = typeof defaultDb;

const HOUR_MS = 60 * 60 * 1000;

// 128+ bits would do; 256 makes the link impossible to guess or enumerate.
const newToken = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("hex");
}

const uniqueViolation = (error: unknown) =>
  (error as { cause?: { code?: string } }).cause?.code === "23505";

// Midnight at the end of `day` in Lima (UTC-5, no daylight saving time).
const endOfLimaDay = (day: string) => new Date(Date.parse(`${day}T00:00:00.000Z`) + 29 * HOUR_MS);

export async function createShareLink(
  database: Database,
  input: { bookingId: string; userId: string; now: Date },
) {
  const [row] = await database
    .select({ date: tripOffer.date, status: seatBooking.status, offerStatus: tripOffer.status })
    .from(seatBooking)
    .innerJoin(tripOffer, eq(seatBooking.offerId, tripOffer.id))
    .where(and(eq(seatBooking.id, input.bookingId), eq(seatBooking.passengerId, input.userId)))
    .limit(1);
  if (!row) {
    throw new ApiError(404, "No encontramos esta reserva.", { code: "booking_not_found" });
  }
  const tripDay = row.date ?? limaClock(input.now).today;
  if (
    row.status !== "accepted" ||
    row.offerStatus === "cancelled" ||
    tripDay < limaClock(input.now).today
  ) {
    throw new ApiError(409, "Solo puedes compartir un viaje con asiento confirmado.", {
      code: "booking_not_shareable",
    });
  }
  const token = newToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = endOfLimaDay(tripDay);
  // One link per trip: sharing again retires the one that may have been sent to the wrong chat.
  // The Neon HTTP driver has no transactions, so the partial unique index (one live link per
  // booking) is what keeps this safe: if a concurrent share inserted in between, ours is
  // refused with 23505 and retried once, which then retires that one. The newest always wins.
  const attempt = async () => {
    await database
      .update(tripShareLink)
      .set({ revokedAt: input.now })
      .where(and(eq(tripShareLink.bookingId, input.bookingId), isNull(tripShareLink.revokedAt)));
    const [created] = await database
      .insert(tripShareLink)
      .values({ bookingId: input.bookingId, tokenHash, expiresAt })
      .returning({ id: tripShareLink.id, expiresAt: tripShareLink.expiresAt });
    return created!;
  };
  const link = await attempt().catch((error: unknown) => {
    if (uniqueViolation(error)) return attempt();
    throw error;
  });
  return { id: link.id, token, expiresAt: link.expiresAt.toISOString() };
}

const unavailable = () =>
  new ApiError(404, "Este enlace ya no está disponible.", { code: "share_link_unavailable" });

// What anyone holding the link sees: the minimum to accompany the trip, never contact data.
export async function getSharedTrip(database: Database, input: { token: string; now: Date }) {
  const driver = alias(userTable, "driver");
  const passenger = alias(userTable, "passenger");
  const driverMember = alias(communityMember, "driver_member");
  const passengerMember = alias(communityMember, "passenger_member");
  const [row] = await database
    .select({
      driverAlias: driverMember.alias,
      driverName: driver.name,
      passengerAlias: passengerMember.alias,
      passengerName: passenger.name,
      make: vehicle.make,
      model: vehicle.model,
      color: vehicle.color,
      plate: vehicle.plate,
      meetingPointId: seatBooking.meetingPointId,
      pickupAt: seatBooking.pickupAt,
      startedAt: seatBooking.startedAt,
      arrivedAt: seatBooking.arrivedAt,
    })
    .from(tripShareLink)
    .innerJoin(seatBooking, eq(tripShareLink.bookingId, seatBooking.id))
    .innerJoin(tripOffer, eq(seatBooking.offerId, tripOffer.id))
    .innerJoin(vehicle, eq(tripOffer.vehicleId, vehicle.id))
    .innerJoin(driver, eq(tripOffer.driverId, driver.id))
    .innerJoin(passenger, eq(seatBooking.passengerId, passenger.id))
    .leftJoin(
      driverMember,
      and(
        eq(driverMember.userId, tripOffer.driverId),
        eq(driverMember.communityId, tripOffer.communityId),
      ),
    )
    .leftJoin(
      passengerMember,
      and(
        eq(passengerMember.userId, seatBooking.passengerId),
        eq(passengerMember.communityId, tripOffer.communityId),
      ),
    )
    .where(
      and(
        eq(tripShareLink.tokenHash, await sha256Hex(input.token)),
        isNull(tripShareLink.revokedAt),
        inArray(seatBooking.status, ["accepted", "completed"]),
        ne(tripOffer.status, "cancelled"),
        gt(tripShareLink.expiresAt, input.now),
      ),
    )
    .limit(1);
  if (!row) throw unavailable();
  return {
    passengerAlias: displayName(row.passengerAlias, row.passengerName),
    driverAlias: displayName(row.driverAlias, row.driverName),
    vehicle: { make: row.make, model: row.model, color: row.color, plate: row.plate },
    meetingPointName:
      places.meetingPoints.find((point) => point.id === row.meetingPointId)?.name ??
      row.meetingPointId,
    estimatedTime: row.pickupAt.slice(0, 5),
    // US-025 records both moments: started_at when the trip begins, arrived_at on "Llegué bien".
    status: row.arrivedAt
      ? ("arrived" as const)
      : row.startedAt
        ? ("in_progress" as const)
        : ("not_started" as const),
  };
}

export async function revokeShareLink(
  database: Database,
  input: { linkId: string; userId: string; now: Date },
) {
  const [mine] = await database
    .select({ id: tripShareLink.id, revokedAt: tripShareLink.revokedAt })
    .from(tripShareLink)
    .innerJoin(seatBooking, eq(tripShareLink.bookingId, seatBooking.id))
    .where(and(eq(tripShareLink.id, input.linkId), eq(seatBooking.passengerId, input.userId)))
    .limit(1);
  if (!mine) {
    throw new ApiError(404, "No encontramos este enlace.", { code: "share_link_not_found" });
  }
  // Stopping twice changes nothing: the first moment stays.
  const revokedAt = mine.revokedAt ?? input.now;
  if (!mine.revokedAt) {
    await database.update(tripShareLink).set({ revokedAt }).where(eq(tripShareLink.id, mine.id));
  }
  return { id: mine.id, revokedAt: revokedAt.toISOString() };
}

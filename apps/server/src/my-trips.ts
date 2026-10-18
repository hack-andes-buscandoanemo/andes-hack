import type { db as defaultDb } from "@andes-hack/db";
import { user as userTable } from "@andes-hack/db/schema/auth";
import { community, communityMember } from "@andes-hack/db/schema/community";
import { zone } from "@andes-hack/db/schema/places";
import { seatBooking, tripOffer } from "@andes-hack/db/schema/trips";
import { vehicle } from "@andes-hack/db/schema/vehicle";
import { places } from "@andes-hack/matching";
import { and, desc, eq, inArray } from "drizzle-orm";

import { acceptedCountByOffer, fuelEstimateFor, occupantsSharingFuel } from "./fuel-estimate";
import { destinationOf } from "./search";
import {
  canSeePlate,
  displayName,
  hasPassed,
  limaClock,
  passengerStatus,
  seatsFree,
} from "./trip-rules";

type Database = typeof defaultDb;

type TripScope = "upcoming" | "past";

// Only a request still waiting or accepted can be ahead of the person.
const isOpen = (status: string) => status === "pending" || status === "accepted";

async function passengerTrips(database: Database, userId: string, scope: TripScope) {
  const rows = await database
    .select({
      id: seatBooking.id,
      offerId: tripOffer.id,
      status: seatBooking.status,
      offerStatus: tripOffer.status,
      direction: tripOffer.direction,
      date: tripOffer.date,
      daysOfWeek: tripOffer.daysOfWeek,
      pickupAt: seatBooking.pickupAt,
      meetingPointId: seatBooking.meetingPointId,
      originZoneId: tripOffer.originZoneId,
      originZoneName: zone.name,
      destinationName: community.destinationName,
      driverAlias: communityMember.alias,
      accountName: userTable.name,
      plate: vehicle.plate,
    })
    .from(seatBooking)
    .innerJoin(tripOffer, eq(seatBooking.offerId, tripOffer.id))
    .innerJoin(community, eq(tripOffer.communityId, community.id))
    .innerJoin(zone, eq(tripOffer.originZoneId, zone.id))
    .innerJoin(userTable, eq(tripOffer.driverId, userTable.id))
    .leftJoin(
      communityMember,
      and(
        eq(communityMember.userId, tripOffer.driverId),
        eq(communityMember.communityId, tripOffer.communityId),
      ),
    )
    .leftJoin(vehicle, eq(tripOffer.vehicleId, vehicle.id))
    .where(eq(seatBooking.passengerId, userId))
    .orderBy(desc(seatBooking.createdAt));

  const acceptedCount = await acceptedCountByOffer(
    database,
    rows.map((row) => row.offerId),
  );
  const clock = limaClock();
  return rows
    .map((row) => {
      const passed = hasPassed({ date: row.date, time: row.pickupAt }, clock);
      return { ...row, passed, derived: passengerStatus({ ...row, passed }) };
    })
    .filter((row) => (isOpen(row.derived) && !row.passed) === (scope === "upcoming"))
    .map((row) => {
      const destination = destinationOf({ destinationName: row.destinationName });
      return {
        id: row.id,
        offerId: row.offerId,
        role: "passenger" as const,
        status: row.derived,
        direction: row.direction,
        date: row.date,
        daysOfWeek: row.daysOfWeek,
        time: row.pickupAt,
        originZoneName: row.originZoneName,
        destinationName: destination.name,
        meetingPointName:
          places.meetingPoints.find((point) => point.id === row.meetingPointId)?.name ??
          row.meetingPointId,
        // The other person is revealed only once the request is accepted.
        driver:
          row.derived === "accepted"
            ? {
                alias: displayName(row.driverAlias, row.accountName),
                plate: canSeePlate({ ...row, isOwn: false, bookingStatus: row.status })
                  ? row.plate
                  : null,
              }
            : null,
        seatsTotal: null,
        seatsFree: null,
        pendingRequests: null,
        acceptedPassengers: null,
        fuelEstimate: fuelEstimateFor({
          direction: row.direction,
          originZoneId: row.originZoneId,
          destinationId: destination.id,
          // An accepted passenger is already among those counted aboard.
          occupants: occupantsSharingFuel(
            acceptedCount.get(row.offerId) ?? 0,
            row.status === "accepted",
          ),
        }),
      };
    });
}

async function driverTrips(database: Database, userId: string, scope: TripScope) {
  const offers = await database
    .select({
      id: tripOffer.id,
      communityId: tripOffer.communityId,
      status: tripOffer.status,
      direction: tripOffer.direction,
      date: tripOffer.date,
      daysOfWeek: tripOffer.daysOfWeek,
      departureTime: tripOffer.departureTime,
      seatsTotal: tripOffer.seatsTotal,
      originZoneId: tripOffer.originZoneId,
      originZoneName: zone.name,
      destinationName: community.destinationName,
    })
    .from(tripOffer)
    .innerJoin(community, eq(tripOffer.communityId, community.id))
    .innerJoin(zone, eq(tripOffer.originZoneId, zone.id))
    .where(eq(tripOffer.driverId, userId))
    .orderBy(desc(tripOffer.createdAt));
  if (offers.length === 0) return [];

  // One query for every offer's requests, not one per offer.
  const bookings = await database
    .select({
      offerId: seatBooking.offerId,
      status: seatBooking.status,
      alias: communityMember.alias,
      accountName: userTable.name,
    })
    .from(seatBooking)
    .innerJoin(userTable, eq(seatBooking.passengerId, userTable.id))
    .innerJoin(tripOffer, eq(seatBooking.offerId, tripOffer.id))
    .leftJoin(
      communityMember,
      and(
        eq(communityMember.userId, seatBooking.passengerId),
        eq(communityMember.communityId, tripOffer.communityId),
      ),
    )
    .where(
      and(
        inArray(
          seatBooking.offerId,
          offers.map((offer) => offer.id),
        ),
        inArray(seatBooking.status, ["pending", "accepted"]),
      ),
    );

  const clock = limaClock();
  return offers
    .map((offer) => {
      const status = driverStatus(offer, clock);
      // A cancelled offer reveals nobody: its requests were released.
      const mine =
        status === "cancelled" ? [] : bookings.filter((booking) => booking.offerId === offer.id);
      const accepted = mine.filter((booking) => booking.status === "accepted");
      const destination = destinationOf({ destinationName: offer.destinationName });
      return {
        id: offer.id,
        offerId: offer.id,
        role: "driver" as const,
        status,
        direction: offer.direction,
        date: offer.date,
        daysOfWeek: offer.daysOfWeek,
        time: offer.departureTime,
        originZoneName: offer.originZoneName,
        destinationName: destination.name,
        meetingPointName: null,
        driver: null,
        seatsTotal: offer.seatsTotal,
        seatsFree: seatsFree(offer.seatsTotal, accepted.length),
        pendingRequests: mine.filter((booking) => booking.status === "pending").length,
        // Aliases only, and only of people the driver already accepted.
        acceptedPassengers: accepted.map((booking) =>
          displayName(booking.alias, booking.accountName),
        ),
        fuelEstimate: fuelEstimateFor({
          direction: offer.direction,
          originZoneId: offer.originZoneId,
          destinationId: destination.id,
          occupants: occupantsSharingFuel(accepted.length, true),
        }),
      };
    })
    .filter(
      (trip) => (trip.status === "active" || trip.status === "paused") === (scope === "upcoming"),
    );
}

function driverStatus(
  offer: { status: "active" | "paused" | "cancelled"; date: string | null; departureTime: string },
  clock: ReturnType<typeof limaClock>,
) {
  if (offer.status === "cancelled") return "cancelled" as const;
  if (hasPassed({ date: offer.date, time: offer.departureTime }, clock))
    return "completed" as const;
  return offer.status;
}

export async function listMyTrips(
  database: Database,
  input: { userId: string; role: "passenger" | "driver"; scope: TripScope },
) {
  const trips =
    input.role === "driver"
      ? await driverTrips(database, input.userId, input.scope)
      : await passengerTrips(database, input.userId, input.scope);
  return { trips };
}

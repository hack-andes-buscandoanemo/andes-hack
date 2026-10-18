import type { db as defaultDb } from "@andes-hack/db";
import { user as userTable } from "@andes-hack/db/schema/auth";
import { community, communityMember } from "@andes-hack/db/schema/community";
import { zone } from "@andes-hack/db/schema/places";
import { fallbackModeEnum, seatBooking, tripOffer, tripRequest } from "@andes-hack/db/schema/trips";
import { vehicle } from "@andes-hack/db/schema/vehicle";
import { places } from "@andes-hack/matching";
import { and, desc, eq, inArray, ne } from "drizzle-orm";

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

type FallbackMode = (typeof fallbackModeEnum.enumValues)[number];
type ReturnNeed = { windowStart: string; windowEnd: string; fallbackMode: FallbackMode };

// What the "¿Y el regreso?" card needs; only an accepted trip has one (US-023).
function passengerRequestOf(
  row: {
    derived: string;
    communityId: string;
    requestOriginZoneId: string;
    requestDate: string | null;
    requestDays: number[] | null;
    fallbackMode: FallbackMode;
  },
  need: ReturnNeed | undefined,
) {
  if (row.derived !== "accepted") return undefined;
  return {
    communityId: row.communityId,
    originZoneId: row.requestOriginZoneId,
    date: row.requestDate,
    daysOfWeek: row.requestDays,
    fallbackMode: need?.fallbackMode ?? row.fallbackMode,
    returnWindow: need
      ? { start: need.windowStart.slice(0, 5), end: need.windowEnd.slice(0, 5) }
      : null,
  };
}

async function passengerTrips(database: Database, userId: string, scope: TripScope) {
  const rows = await database
    .select({
      id: seatBooking.id,
      offerId: tripOffer.id,
      communityId: tripRequest.communityId,
      requestOriginZoneId: tripRequest.originZoneId,
      requestDate: tripRequest.date,
      requestDays: tripRequest.daysOfWeek,
      fallbackMode: tripRequest.fallbackMode,
      status: seatBooking.status,
      offerStatus: tripOffer.status,
      direction: tripOffer.direction,
      date: tripOffer.date,
      daysOfWeek: tripOffer.daysOfWeek,
      pickupAt: seatBooking.pickupAt,
      meetingPointId: seatBooking.meetingPointId,
      originZoneName: zone.name,
      destinationName: community.destinationName,
      driverAlias: communityMember.alias,
      accountName: userTable.name,
      plate: vehicle.plate,
    })
    .from(seatBooking)
    .innerJoin(tripRequest, eq(seatBooking.requestId, tripRequest.id))
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

  const returnNeeds =
    rows.length === 0
      ? []
      : await database
          .select({
            communityId: tripRequest.communityId,
            originZoneId: tripRequest.originZoneId,
            windowStart: tripRequest.windowStart,
            windowEnd: tripRequest.windowEnd,
            fallbackMode: tripRequest.fallbackMode,
          })
          .from(tripRequest)
          .where(
            and(
              eq(tripRequest.passengerId, userId),
              eq(tripRequest.direction, "return"),
              ne(tripRequest.status, "cancelled"),
              inArray(
                tripRequest.communityId,
                rows.map((row) => row.communityId),
              ),
            ),
          )
          .orderBy(desc(tripRequest.updatedAt), desc(tripRequest.id));
  // Newest first, so the first need seen for a community and zone is the one to keep.
  const returnNeedByPlace = new Map<string, (typeof returnNeeds)[number]>();
  for (const need of returnNeeds) {
    const key = `${need.communityId}:${need.originZoneId}`;
    if (!returnNeedByPlace.has(key)) returnNeedByPlace.set(key, need);
  }
  const clock = limaClock();
  return rows
    .map((row) => {
      const passed = hasPassed({ date: row.date, time: row.pickupAt }, clock);
      return { ...row, passed, derived: passengerStatus({ ...row, passed }) };
    })
    .filter((row) => (isOpen(row.derived) && !row.passed) === (scope === "upcoming"))
    .map((row) => ({
      id: row.id,
      offerId: row.offerId,
      role: "passenger" as const,
      status: row.derived,
      direction: row.direction,
      date: row.date,
      daysOfWeek: row.daysOfWeek,
      time: row.pickupAt,
      originZoneName: row.originZoneName,
      destinationName: destinationOf({ destinationName: row.destinationName }).name,
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
      passengerRequest: passengerRequestOf(
        row,
        returnNeedByPlace.get(`${row.communityId}:${row.requestOriginZoneId}`),
      ),
    }));
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
        destinationName: destinationOf({ destinationName: offer.destinationName }).name,
        meetingPointName: null,
        driver: null,
        seatsTotal: offer.seatsTotal,
        seatsFree: seatsFree(
          offer.seatsTotal,
          mine.filter((booking) => booking.status === "accepted").length,
        ),
        pendingRequests: mine.filter((booking) => booking.status === "pending").length,
        // Aliases only, and only of people the driver already accepted.
        acceptedPassengers: mine
          .filter((booking) => booking.status === "accepted")
          .map((booking) => displayName(booking.alias, booking.accountName)),
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

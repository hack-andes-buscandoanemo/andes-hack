import type { SearchTripsBodySchema } from "@andes-hack/api";
import type { db as defaultDb } from "@andes-hack/db";
import { user as userTable } from "@andes-hack/db/schema/auth";
import { community, communityMember } from "@andes-hack/db/schema/community";
import { zone } from "@andes-hack/db/schema/places";
import { seatBooking, tripOffer, tripRequest } from "@andes-hack/db/schema/trips";
import {
  createTravelTimeModel,
  places,
  rankOffersForRequest,
  type OfferRoute,
  type RideRequest,
} from "@andes-hack/matching";
import { and, asc, eq, inArray, ne, type SQL } from "drizzle-orm";
import type { z } from "zod";

import { fuelEstimateFor, occupantsSharingFuel } from "./fuel-estimate";
import { logEvent } from "./lib/logger";
import { getCommunityProfilePhotos, type ProfilePhotoStorageResolver } from "./profile-photos";
import { displayName, seatsFree } from "./trip-rules";
import { ApiError } from "./utils/api-response";

type Database = typeof defaultDb;
type SearchBody = z.infer<typeof SearchTripsBodySchema>;

const model = createTravelTimeModel();

// The community stores its destination as a name and coordinates; the engine knows it as a place.
export function destinationOf(row: { destinationName: string }) {
  const place = places.destinations.find((candidate) => candidate.name === row.destinationName);
  if (!place) {
    throw new ApiError(409, "La sede de esta comunidad todavía no se puede usar para buscar.", {
      code: "unknown_destination",
    });
  }
  return place;
}

// Every active-offer input the engine needs, with accepted passengers and the rejections of
// this person, or of everyone when no person is given (the day's matching, US-019).
export async function loadOfferRoutes(
  database: Database,
  input: {
    where: SQL | undefined;
    userId?: string;
    communityId: string;
    destination: { id: string };
  },
) {
  const { where, userId, communityId, destination } = input;
  const rows = await database
    .select({
      id: tripOffer.id,
      driverId: tripOffer.driverId,
      direction: tripOffer.direction,
      originZoneId: tripOffer.originZoneId,
      originZoneName: zone.name,
      departureTime: tripOffer.departureTime,
      date: tripOffer.date,
      daysOfWeek: tripOffer.daysOfWeek,
      seatsTotal: tripOffer.seatsTotal,
      maxDetourMinutes: tripOffer.maxDetourMinutes,
      womenOnly: tripOffer.womenOnly,
      driverName: communityMember.alias,
      accountName: userTable.name,
      driverIsWoman: communityMember.identifiesAsWoman,
    })
    .from(tripOffer)
    .innerJoin(zone, eq(tripOffer.originZoneId, zone.id))
    .innerJoin(userTable, eq(tripOffer.driverId, userTable.id))
    .innerJoin(
      communityMember,
      and(
        eq(communityMember.userId, tripOffer.driverId),
        eq(communityMember.communityId, tripOffer.communityId),
      ),
    )
    .where(where);

  // Accepted passengers hold seats and their windows still bind the driver.
  // ponytail: ordered by pickup time then arrival of the booking; the stop position is not stored (US-014 may add it).
  const accepted = rows.length
    ? await database
        .select({
          offerId: seatBooking.offerId,
          passengerId: seatBooking.passengerId,
          meetingPointId: seatBooking.meetingPointId,
          windowStart: tripRequest.windowStart,
          windowEnd: tripRequest.windowEnd,
        })
        .from(seatBooking)
        .innerJoin(tripRequest, eq(seatBooking.requestId, tripRequest.id))
        .where(
          and(
            inArray(
              seatBooking.offerId,
              rows.map((row) => row.id),
            ),
            eq(seatBooking.status, "accepted"),
          ),
        )
        .orderBy(asc(seatBooking.pickupAt), asc(seatBooking.createdAt))
    : [];

  const rejected = rows.length
    ? await database
        .select({ offerId: seatBooking.offerId, passengerId: seatBooking.passengerId })
        .from(seatBooking)
        .where(
          and(
            inArray(
              seatBooking.offerId,
              rows.map((row) => row.id),
            ),
            userId === undefined ? undefined : eq(seatBooking.passengerId, userId),
            eq(seatBooking.status, "rejected"),
          ),
        )
    : [];
  const acceptedByOffer = Map.groupBy(accepted, (booking) => booking.offerId);
  const rejectedByOffer = Map.groupBy(rejected, (booking) => booking.offerId);
  const routes: OfferRoute[] = rows.map((row) => ({
    id: row.id,
    communityId,
    direction: row.direction,
    originZoneId: row.originZoneId,
    destinationId: destination.id,
    departureTime: row.departureTime.slice(0, 5),
    date: row.date,
    daysOfWeek: row.daysOfWeek,
    seatsTotal: row.seatsTotal,
    maxDetourMinutes: row.maxDetourMinutes,
    womenOnly: row.womenOnly,
    driverIsWoman: row.driverIsWoman,
    rejectedPassengerIds: (rejectedByOffer.get(row.id) ?? []).flatMap(
      (booking) => booking.passengerId ?? [],
    ),
    passengers: (acceptedByOffer.get(row.id) ?? []).map((booking) => ({
      meetingPointId: booking.meetingPointId,
      windowStart: booking.windowStart.slice(0, 5),
      windowEnd: booking.windowEnd.slice(0, 5),
    })),
  }));
  return { rows, routes, acceptedByOffer };
}

// What a person asked for, as stored in a trip request or sent by the search form.
type NeedFields = Pick<
  typeof tripRequest.$inferSelect,
  "direction" | "originZoneId" | "windowStart" | "windowEnd" | "maxWalkMinutes"
> & { date?: string | null; daysOfWeek?: number[] | null; womenOnly?: boolean };

type MatchOfferInput = {
  offerId: string;
  communityId: string;
  userId: string;
  passengerIsWoman: boolean;
  destination: { id: string };
  need: NeedFields;
};

// The single place that turns a need into the engine's request (stored times may carry seconds).
export function toRideRequest(
  need: NeedFields,
  who: { userId: string; communityId: string; womenOnly: boolean; passengerIsWoman: boolean },
): RideRequest {
  return {
    passengerId: who.userId,
    communityId: who.communityId,
    direction: need.direction,
    originZoneId: need.originZoneId,
    windowStart: need.windowStart.slice(0, 5),
    windowEnd: need.windowEnd.slice(0, 5),
    date: need.date ?? null,
    daysOfWeek: need.daysOfWeek ?? null,
    maxWalkMinutes: need.maxWalkMinutes,
    womenOnly: who.womenOnly,
    passengerIsWoman: who.passengerIsWoman,
  };
}

// The engine's verdict on one offer for a saved need: the pickup it calculates, or null when it no longer fits.
export async function matchOfferForNeed(database: Database, input: MatchOfferInput) {
  const { need, userId, communityId } = input;
  const { routes } = await loadOfferRoutes(database, {
    where: and(eq(tripOffer.id, input.offerId), eq(tripOffer.status, "active")),
    userId,
    communityId,
    destination: input.destination,
  });
  const request = toRideRequest(need, {
    userId,
    communityId,
    womenOnly: need.womenOnly ?? false,
    passengerIsWoman: input.passengerIsWoman,
  });
  return rankOffersForRequest(request, routes, model).matches[0] ?? null;
}

export async function searchTrips(
  database: Database,
  input: { communityId: string; userId: string; body: SearchBody },
  storageForPhotos?: ProfilePhotoStorageResolver,
) {
  const { communityId, userId, body } = input;
  const [destinationRow] = await database
    .select({ destinationName: community.destinationName })
    .from(community)
    .where(eq(community.id, communityId))
    .limit(1);
  if (!destinationRow) {
    throw new ApiError(404, "No encontramos esta comunidad.", { code: "community_not_found" });
  }
  const destination = destinationOf(destinationRow);

  const [passenger] = await database
    .select({
      identifiesAsWoman: communityMember.identifiesAsWoman,
      womenOnly: communityMember.womenOnly,
    })
    .from(communityMember)
    .where(and(eq(communityMember.communityId, communityId), eq(communityMember.userId, userId)))
    .limit(1);

  if (!passenger) {
    throw new ApiError(403, "Únete a esta comunidad para buscar viajes.", {
      code: "not_a_member",
    });
  }

  const womenOnly = body.womenOnly ?? passenger.womenOnly;
  if (womenOnly && !passenger.identifiesAsWoman) {
    throw new ApiError(
      403,
      "Esta preferencia solo está disponible para quienes la activaron en su perfil.",
      { code: "women_only_not_allowed" },
    );
  }

  // The zone must exist in the database (the need references it) and in the engine's places.
  const [knownZone] = await database
    .select({ id: zone.id })
    .from(zone)
    .where(eq(zone.id, body.originZoneId))
    .limit(1);
  if (!knownZone || !places.zones.some((place) => place.id === body.originZoneId)) {
    throw new ApiError(400, "Selecciona una zona de la lista.", { code: "zone_not_found" });
  }

  const need = {
    originZoneId: body.originZoneId,
    windowStart: body.windowStart,
    windowEnd: body.windowEnd,
    daysOfWeek: body.daysOfWeek ?? null,
    date: body.date ?? null,
    maxWalkMinutes: body.maxWalkMinutes,
    fallbackMode: body.fallbackMode,
    womenOnly,
  };
  const { rows, routes, acceptedByOffer } = await loadOfferRoutes(database, {
    communityId,
    userId,
    destination,
    where: and(
      eq(tripOffer.communityId, communityId),
      eq(tripOffer.status, "active"),
      ne(tripOffer.driverId, userId),
    ),
  });

  const request = toRideRequest(body, {
    userId,
    communityId,
    womenOnly,
    passengerIsWoman: passenger.identifiesAsWoman,
  });

  const ranking = rankOffersForRequest(request, routes, model);
  const hadResults = ranking.matches.length > 0;
  // One open need per person and direction, enforced by a partial unique index: searching again updates it.
  const [saved] = await database
    .insert(tripRequest)
    .values({ ...need, hadResults, communityId, passengerId: userId, direction: body.direction })
    .onConflictDoUpdate({
      target: [tripRequest.communityId, tripRequest.passengerId, tripRequest.direction],
      targetWhere: eq(tripRequest.status, "open"),
      set: { ...need, hadResults },
    })
    .returning({ id: tripRequest.id });

  const byId = new Map(rows.map((row) => [row.id, row]));
  const meetingPointNames = new Map(places.meetingPoints.map((point) => [point.id, point.name]));
  const photoUrls = await getCommunityProfilePhotos(
    database,
    storageForPhotos,
    communityId,
    rows.flatMap((row) => (row.driverId ? [row.driverId] : [])),
  );

  // For the coverage panel (US-030, US-031): only the outcome, never who searched or from where.
  logEvent("search.completed", { communityId, hadResults });

  return {
    requestId: saved!.id,
    reason: ranking.reason,
    matches: ranking.matches.map((match) => {
      const offer = byId.get(match.offerId)!;
      const accepted = acceptedByOffer.get(offer.id) ?? [];
      return {
        offerId: match.offerId,
        driverName: displayName(offer.driverName, offer.accountName),
        driverPhotoUrl: offer.driverId ? (photoUrls.get(offer.driverId) ?? null) : null,
        originZoneName: offer.originZoneName,
        destinationName: destination.name,
        direction: offer.direction,
        departureTime: offer.departureTime,
        // Same count the engine uses for its seat check: accepted passengers.
        seatsFree: seatsFree(offer.seatsTotal, accepted.length),
        meetingPointName: meetingPointNames.get(match.meetingPointId) ?? match.meetingPointId,
        pickupAt: match.pickupAt,
        arrivalAt: match.arrivalAt,
        detourMinutes: match.detourMinutes,
        walkMinutes: match.walkMinutes,
        // Someone already accepted on this trip who searches again is not counted twice.
        fuelEstimate: fuelEstimateFor({
          direction: offer.direction,
          originZoneId: offer.originZoneId,
          destinationId: destination.id,
          occupants: occupantsSharingFuel(
            accepted.length,
            accepted.some((booking) => booking.passengerId === userId),
          ),
        }),
      };
    }),
  };
}

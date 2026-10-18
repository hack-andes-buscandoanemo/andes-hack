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
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { z } from "zod";

import { logEvent } from "./lib/logger";
import { ApiError } from "./utils/api-response";

type Database = typeof defaultDb;
type SearchBody = z.infer<typeof SearchTripsBodySchema>;
type PhotoUrlSigner = (key: string, options?: { expiresIn?: number }) => Promise<string>;

const model = createTravelTimeModel();

// The community stores its destination as a name and coordinates; the engine knows it as a place.
function destinationOf(row: { destinationName: string }) {
  const place = places.destinations.find((candidate) => candidate.name === row.destinationName);
  if (!place) {
    throw new ApiError(409, "La sede de esta comunidad todavía no se puede usar para buscar.", {
      code: "unknown_destination",
    });
  }
  return place;
}

export async function searchTrips(
  database: Database,
  input: { communityId: string; userId: string; body: SearchBody },
  signPhotoUrl: PhotoUrlSigner,
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
    .select({ identifiesAsWoman: communityMember.identifiesAsWoman })
    .from(communityMember)
    .where(and(eq(communityMember.communityId, communityId), eq(communityMember.userId, userId)))
    .limit(1);

  if (!passenger) {
    throw new ApiError(403, "Únete a esta comunidad para buscar viajes.", {
      code: "not_a_member",
    });
  }

  if (body.womenOnly && !passenger.identifiesAsWoman) {
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
  };
  const rows = await database
    .select({
      id: tripOffer.id,
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
      image: userTable.image,
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
    .where(
      and(
        eq(tripOffer.communityId, communityId),
        eq(tripOffer.status, "active"),
        ne(tripOffer.driverId, userId),
      ),
    );

  // Accepted passengers hold seats and their windows still bind the driver.
  // ponytail: ordered by pickup time then arrival of the booking; the stop position is not stored (US-014 may add it).
  const accepted = rows.length
    ? await database
        .select({
          offerId: seatBooking.offerId,
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
        .select({ offerId: seatBooking.offerId })
        .from(seatBooking)
        .where(
          and(
            inArray(
              seatBooking.offerId,
              rows.map((row) => row.id),
            ),
            eq(seatBooking.passengerId, userId),
            eq(seatBooking.status, "rejected"),
          ),
        )
    : [];

  const request: RideRequest = {
    passengerId: userId,
    communityId,
    direction: body.direction,
    originZoneId: body.originZoneId,
    windowStart: body.windowStart,
    windowEnd: body.windowEnd,
    date: body.date ?? null,
    daysOfWeek: body.daysOfWeek ?? null,
    maxWalkMinutes: body.maxWalkMinutes,
    womenOnly: body.womenOnly,
    passengerIsWoman: passenger.identifiesAsWoman,
  };
  const acceptedByOffer = Map.groupBy(accepted, (booking) => booking.offerId);
  const rejectedOffers = new Set(rejected.map((booking) => booking.offerId));
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
    rejectedPassengerIds: rejectedOffers.has(row.id) ? [userId] : [],
    passengers: (acceptedByOffer.get(row.id) ?? []).map((booking) => ({
      meetingPointId: booking.meetingPointId,
      windowStart: booking.windowStart.slice(0, 5),
      windowEnd: booking.windowEnd.slice(0, 5),
    })),
  }));

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

  // For the coverage panel (US-030, US-031): only the outcome, never who searched or from where.
  logEvent("search.completed", { communityId, hadResults });

  return {
    requestId: saved!.id,
    reason: ranking.reason,
    matches: await Promise.all(
      ranking.matches.map(async (match) => {
        const offer = byId.get(match.offerId)!;
        return {
          offerId: match.offerId,
          driverName: offer.driverName ?? offer.accountName,
          driverPhotoUrl: offer.image ? await signPhotoUrl(offer.image, { expiresIn: 300 }) : null,
          originZoneName: offer.originZoneName,
          destinationName: destination.name,
          direction: offer.direction,
          departureTime: offer.departureTime,
          // Same count the engine uses for its seat check: accepted passengers.
          seatsFree: offer.seatsTotal - (acceptedByOffer.get(offer.id)?.length ?? 0),
          meetingPointName: meetingPointNames.get(match.meetingPointId) ?? match.meetingPointId,
          pickupAt: match.pickupAt,
          arrivalAt: match.arrivalAt,
          detourMinutes: match.detourMinutes,
          walkMinutes: match.walkMinutes,
        };
      }),
    ),
  };
}

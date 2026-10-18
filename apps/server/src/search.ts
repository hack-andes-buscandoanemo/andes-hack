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
) {
  const { communityId, userId, body } = input;
  const [destinationRow] = await database
    .select({ destinationName: community.destinationName })
    .from(community)
    .where(eq(community.id, communityId))
    .limit(1);
  const destination = destinationOf(destinationRow!);

  const [passenger] = await database
    .select({ identifiesAsWoman: communityMember.identifiesAsWoman })
    .from(communityMember)
    .where(and(eq(communityMember.communityId, communityId), eq(communityMember.userId, userId)))
    .limit(1);

  if (body.womenOnly && !passenger!.identifiesAsWoman) {
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
  // One open need per person and direction. ponytail: no unique index, so two searches at the same instant could save two.
  const [open] = await database
    .select({ id: tripRequest.id })
    .from(tripRequest)
    .where(
      and(
        eq(tripRequest.communityId, communityId),
        eq(tripRequest.passengerId, userId),
        eq(tripRequest.direction, body.direction),
        eq(tripRequest.status, "open"),
      ),
    )
    .limit(1);
  const [saved] = open
    ? await database
        .update(tripRequest)
        .set(need)
        .where(eq(tripRequest.id, open.id))
        .returning({ id: tripRequest.id })
    : await database
        .insert(tripRequest)
        .values({ ...need, communityId, passengerId: userId, direction: body.direction })
        .returning({ id: tripRequest.id });

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
    passengerIsWoman: passenger!.identifiesAsWoman,
  };
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
    rejectedPassengerIds: rejected.some((booking) => booking.offerId === row.id) ? [userId] : [],
    passengers: accepted
      .filter((booking) => booking.offerId === row.id)
      .map((booking) => ({
        meetingPointId: booking.meetingPointId,
        windowStart: booking.windowStart.slice(0, 5),
        windowEnd: booking.windowEnd.slice(0, 5),
      })),
  }));

  const ranking = rankOffersForRequest(request, routes, model);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const meetingPointNames = new Map(places.meetingPoints.map((point) => [point.id, point.name]));

  // For the coverage panel (US-030, US-031): only the outcome, never who searched or from where.
  logEvent("search.completed", { communityId, hadResults: ranking.matches.length > 0 });

  return {
    requestId: saved!.id,
    reason: ranking.reason,
    matches: ranking.matches.map((match) => {
      const offer = byId.get(match.offerId)!;
      return {
        offerId: match.offerId,
        driverName: offer.driverName ?? offer.accountName,
        originZoneName: offer.originZoneName,
        destinationName: destination.name,
        direction: offer.direction,
        departureTime: offer.departureTime,
        seatsFree:
          offer.seatsTotal - accepted.filter((booking) => booking.offerId === offer.id).length,
        meetingPointName: meetingPointNames.get(match.meetingPointId) ?? match.meetingPointId,
        pickupAt: match.pickupAt,
        arrivalAt: match.arrivalAt,
        detourMinutes: match.detourMinutes,
        walkMinutes: match.walkMinutes,
      };
    }),
  };
}

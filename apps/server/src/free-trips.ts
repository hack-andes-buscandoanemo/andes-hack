import type { SearchTripsBodySchema } from "@andes-hack/api";
import type { db as defaultDb } from "@andes-hack/db";
import { user as userTable } from "@andes-hack/db/schema/auth";
import { communityMember } from "@andes-hack/db/schema/community";
import { seatBooking, tripOffer, tripRequest } from "@andes-hack/db/schema/trips";
import {
  estimateFuelCost,
  matchFreeOffer,
  rankFreeOffers,
  type FreeMatch,
  type FreeOffer,
  type FreeRequest,
} from "@andes-hack/matching";
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import type { z } from "zod";

import { acceptedCountByOffer, occupantsSharingFuel } from "./fuel-estimate";
import { liveOfferIds, nearestZone } from "./live-location";
import { logEvent } from "./lib/logger";
import { getCommunityProfilePhotos, type ProfilePhotoStorageResolver } from "./profile-photos";
import { displayName, seatsFree } from "./trip-rules";
import { ApiError } from "./utils/api-response";

type Database = typeof defaultDb;
type SearchBody = z.infer<typeof SearchTripsBodySchema>;

// The trips between two addresses chosen on the map. Their geometry lives in the offer itself
// (origin, destination and the street route asked to OSRM when it was published), so none of
// this touches the zones, the meeting points or the community's headquarters.

const FALLBACK_LABEL = { origin: "tu ubicación", destination: "tu destino" };

export interface FreeOfferGeometry {
  originLat: number | null;
  originLng: number | null;
  originLabel: string | null;
  destLat: number | null;
  destLng: number | null;
  destLabel: string | null;
  routePath: [number, number][] | null;
  routeApproximate: boolean;
}

export const isFreeOffer = (row: { destLat: number | null }) => row.destLat !== null;

export const placeOf = (lat: number | null, lng: number | null, label: string | null) =>
  lat !== null && lng !== null && label !== null ? { lat, lng, label } : null;

// The line the map draws for a trip between two addresses: its street route, both ends, and
// where the passengers get on. `pickups` already come in the order the car reaches them.
export function freeRouteMap(
  row: FreeOfferGeometry,
  pickups: { lat: number; lng: number; label: string; mine: boolean }[],
) {
  const start = placeOf(row.originLat, row.originLng, row.originLabel)!;
  const end = placeOf(row.destLat, row.destLng, row.destLabel)!;
  const marker = (role: "start" | "end", place: { lat: number; lng: number; label: string }) => ({
    role,
    name: place.label,
    lat: place.lat,
    lng: place.lng,
    mine: false,
  });
  return {
    path: row.routePath ?? [
      [start.lat, start.lng],
      [end.lat, end.lng],
    ],
    approximate: row.routeApproximate || !row.routePath,
    markers: [
      marker("start", start),
      ...pickups.map((pickup) => ({
        role: "meeting" as const,
        name: pickup.label,
        lat: pickup.lat,
        lng: pickup.lng,
        mine: pickup.mine,
      })),
      marker("end", end),
    ],
  };
}

export function toFreeOffer(
  row: {
    id: string;
    routePath: [number, number][] | null;
    routeMinutes: number | null;
    departureTime: string;
    date: string | null;
    daysOfWeek: number[] | null;
    seatsTotal: number;
    womenOnly: boolean;
  },
  accepted: number,
): FreeOffer {
  return {
    id: row.id,
    path: row.routePath ?? [],
    minutes: row.routeMinutes ?? 0,
    departureTime: row.departureTime.slice(0, 5),
    date: row.date,
    daysOfWeek: row.daysOfWeek,
    seatsFree: seatsFree(row.seatsTotal, accepted),
    womenOnly: row.womenOnly,
  };
}

// The need a saved search keeps, as the request the matching takes; null when the search was
// made between zones.
export function freeRequestOf(
  need: {
    originLat: number | null;
    originLng: number | null;
    destLat: number | null;
    destLng: number | null;
    windowStart: string;
    windowEnd: string;
    date: string | null;
    daysOfWeek: number[] | null;
    maxWalkMinutes: number;
    womenOnly: boolean;
  },
  passengerIsWoman: boolean,
): FreeRequest | null {
  if (need.originLat === null || need.originLng === null) return null;
  if (need.destLat === null || need.destLng === null) return null;
  return {
    origin: { lat: need.originLat, lng: need.originLng },
    destination: { lat: need.destLat, lng: need.destLng },
    windowStart: need.windowStart.slice(0, 5),
    windowEnd: need.windowEnd.slice(0, 5),
    date: need.date,
    daysOfWeek: need.daysOfWeek,
    maxWalkMinutes: need.maxWalkMinutes,
    womenOnly: need.womenOnly,
    passengerIsWoman,
  };
}

// How the person sees the pickup and the drop-off: near what they typed, never an address.
export const nearLabel = (label: string | null | undefined, fallback: string) =>
  `Cerca de ${label?.trim() || fallback}`;

// What the seat request stores about a match: where the person boards and gets off.
export function stopsOfMatch(
  match: FreeMatch,
  labels: { origin?: string | null; destination?: string | null },
) {
  return {
    pickupLat: match.pickup.lat,
    pickupLng: match.pickup.lng,
    pickupLabel: nearLabel(labels.origin, FALLBACK_LABEL.origin).slice(0, 160),
    dropoffLat: match.dropoff.lat,
    dropoffLng: match.dropoff.lng,
    dropoffLabel: nearLabel(labels.destination, FALLBACK_LABEL.destination).slice(0, 160),
  };
}

export async function searchFreeTrips(
  database: Database,
  input: {
    communityId: string;
    userId: string;
    body: SearchBody & {
      location: { lat: number; lng: number };
      destination: { lat: number; lng: number };
    };
    now?: Date;
  },
  storageForPhotos?: ProfilePhotoStorageResolver,
) {
  const { communityId, userId, body } = input;
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

  // The need references a zone (the nearest one) so the community's coverage panel keeps
  // working; the matching below never uses it.
  const nearest = nearestZone(body.location);
  const need = {
    originZoneId: nearest.id,
    originLat: body.location.lat,
    originLng: body.location.lng,
    originLabel: body.locationLabel || null,
    destLat: body.destination.lat,
    destLng: body.destination.lng,
    destLabel: body.destinationLabel || null,
    windowStart: body.windowStart,
    windowEnd: body.windowEnd,
    daysOfWeek: body.daysOfWeek ?? null,
    date: body.date ?? null,
    maxWalkMinutes: body.maxWalkMinutes,
    fallbackMode: body.fallbackMode,
    womenOnly,
  };

  const rows = await database
    .select({
      id: tripOffer.id,
      driverId: tripOffer.driverId,
      driverAlias: communityMember.alias,
      accountName: userTable.name,
      originLat: tripOffer.originLat,
      originLng: tripOffer.originLng,
      originLabel: tripOffer.originLabel,
      destLat: tripOffer.destLat,
      destLng: tripOffer.destLng,
      destLabel: tripOffer.destLabel,
      routePath: tripOffer.routePath,
      routeMinutes: tripOffer.routeMinutes,
      routeKm: tripOffer.routeKm,
      routeApproximate: tripOffer.routeApproximate,
      departureTime: tripOffer.departureTime,
      date: tripOffer.date,
      daysOfWeek: tripOffer.daysOfWeek,
      seatsTotal: tripOffer.seatsTotal,
      womenOnly: tripOffer.womenOnly,
      priceCents: tripOffer.priceCents,
      paymentMethods: tripOffer.paymentMethods,
    })
    .from(tripOffer)
    .innerJoin(userTable, eq(userTable.id, tripOffer.driverId))
    .leftJoin(
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
        isNotNull(tripOffer.destLat),
        ne(tripOffer.driverId, userId),
      ),
    );
  const accepted = await acceptedCountByOffer(
    database,
    rows.map((row) => row.id),
  );
  // A driver who rejected this person is not offered again.
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
  const rejectedBy = new Set(rejected.map((row) => row.offerId));
  const open = rows.filter((row) => !rejectedBy.has(row.id));

  const request = freeRequestOf(need, passenger.identifiesAsWoman)!;
  const ranking = rankFreeOffers(
    request,
    open.map((row) => toFreeOffer(row, accepted.get(row.id) ?? 0)),
  );
  const hadResults = ranking.matches.length > 0;

  const [saved] = await database
    .insert(tripRequest)
    .values({ ...need, hadResults, communityId, passengerId: userId, direction: "outbound" })
    .onConflictDoUpdate({
      target: [tripRequest.communityId, tripRequest.passengerId, tripRequest.direction],
      targetWhere: eq(tripRequest.status, "open"),
      set: { ...need, hadResults },
    })
    .returning({ id: tripRequest.id });

  const byId = new Map(open.map((row) => [row.id, row]));
  const live = await liveOfferIds(
    database,
    ranking.matches.map((match) => match.offerId),
    input.now ?? new Date(),
  );
  const photoUrls = await getCommunityProfilePhotos(
    database,
    storageForPhotos,
    communityId,
    open.flatMap((row) => (row.driverId ? [row.driverId] : [])),
  );
  logEvent("search.completed", { communityId, hadResults });

  return {
    requestId: saved!.id,
    originZoneId: nearest.id,
    originZoneName: body.locationLabel || nearest.name,
    reason: ranking.reason,
    matches: ranking.matches.map((match) => {
      const offer = byId.get(match.offerId)!;
      const taken = accepted.get(offer.id) ?? 0;
      const label = (value: string | null, fallback: string) => value ?? fallback;
      return {
        offerId: offer.id,
        driverName: displayName(offer.driverAlias, offer.accountName),
        driverPhotoUrl: offer.driverId ? (photoUrls.get(offer.driverId) ?? null) : null,
        originZoneName: label(offer.originLabel, "Origen"),
        destinationName: label(offer.destLabel, "Destino"),
        direction: "outbound" as const,
        departureTime: offer.departureTime,
        seatsFree: seatsFree(offer.seatsTotal, taken),
        meetingPointName: nearLabel(body.locationLabel, FALLBACK_LABEL.origin),
        pickupAt: match.pickupAt,
        arrivalAt: match.arrivalAt,
        // The car does not leave its route: the person walks to it.
        detourMinutes: 0,
        walkMinutes: match.walkMinutes,
        priceCents: offer.priceCents,
        paymentMethods: offer.paymentMethods,
        live: live.has(offer.id),
        routeMap: freeRouteMap(offer, [
          {
            lat: match.pickup.lat,
            lng: match.pickup.lng,
            label: nearLabel(body.locationLabel, FALLBACK_LABEL.origin),
            mine: true,
          },
        ]),
        // How far the car leaves the person from where they are going.
        dropOffMeters: match.dropoff.walkMeters,
        fuelEstimate: offer.routeKm
          ? estimateFuelCost({
              distanceKm: offer.routeKm,
              occupants: occupantsSharingFuel(taken, false),
            })
          : null,
      };
    }),
  };
}

// The match of one trip for the person's saved need, for the detail and the seat request.
export function matchFreeForNeed(
  row: {
    id: string;
    routePath: [number, number][] | null;
    routeMinutes: number | null;
    departureTime: string;
    date: string | null;
    daysOfWeek: number[] | null;
    seatsTotal: number;
    womenOnly: boolean;
  },
  accepted: number,
  need: Parameters<typeof freeRequestOf>[0],
  passengerIsWoman: boolean,
) {
  const request = freeRequestOf(need, passengerIsWoman);
  if (!request) return null;
  // A full car still shows its route to someone who already sits in it, so seats are not
  // part of this check: the caller decides with the seats it already counted.
  const outcome = matchFreeOffer(request, { ...toFreeOffer(row, accepted), seatsFree: 1 });
  return "match" in outcome ? outcome.match : null;
}

import type { db as defaultDb } from "@andes-hack/db";
import { user as userTable } from "@andes-hack/db/schema/auth";
import { community, communityMember } from "@andes-hack/db/schema/community";
import { zone } from "@andes-hack/db/schema/places";
import { seatBooking, tripLiveLocation, tripOffer } from "@andes-hack/db/schema/trips";
import { haversineKm, places } from "@andes-hack/matching";
import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";

import { getCommunityProfilePhotos, type ProfilePhotoStorageResolver } from "./profile-photos";
import { displayName, seatsFree } from "./trip-rules";
import { ApiError } from "./utils/api-response";

type Database = typeof defaultDb;
type Position = { lat: number; lng: number };

// A position older than this means the driver stopped sharing (closed the app, lost signal).
export const LIVE_FRESH_MS = 2 * 60 * 1000;
// Farther than this from every zone, the person is outside the area Te Jalo covers.
const COVERAGE_KM = 25;
// A passenger who shared their location only gets the alerts of cars this close.
const ALERT_RADIUS_KM = 15;

const freshSince = (now: Date) => new Date(now.getTime() - LIVE_FRESH_MS);

// The zone closest to where the person is, so a search can start from the device's location.
// The coordinates only choose a zone: they are never stored.
export function nearestZone(location: Position) {
  const ranked = places.zones
    .map((zone) => ({ zone, km: haversineKm(location, zone) }))
    .sort((a, b) => a.km - b.km);
  const [closest] = ranked;
  if (!closest || closest.km > COVERAGE_KM) {
    throw new ApiError(400, "Tu ubicación queda fuera de las zonas que cubre Te Jalo.", {
      code: "location_out_of_coverage",
    });
  }
  return closest.zone;
}

async function ownOffer(database: Database, offerId: string, userId: string) {
  const [offer] = await database
    .select({ driverId: tripOffer.driverId, status: tripOffer.status })
    .from(tripOffer)
    .where(eq(tripOffer.id, offerId))
    .limit(1);
  if (!offer) throw new ApiError(404, "No encontramos este viaje.", { code: "offer_not_found" });
  if (offer.driverId !== userId) {
    throw new ApiError(403, "Solo quien maneja puede compartir la posición del auto.", {
      code: "not_the_driver",
    });
  }
  return offer;
}

// Te Jalo on: keeps the last position of the car, overwriting the previous one.
export async function shareLiveLocation(
  database: Database,
  input: {
    offerId: string;
    userId: string;
    position: Position;
    now: Date;
    // Sent when the driver turns Te Jalo on: the price and how it is paid. Left out, they stay.
    priceCents?: number | null;
    paymentMethods?: ("yape" | "cash")[];
  },
) {
  const { offerId, userId, position, now } = input;
  const offer = await ownOffer(database, offerId, userId);
  if (offer.status !== "active") {
    throw new ApiError(409, "Activa el viaje para compartir su posición.", {
      code: "offer_not_active",
    });
  }
  await database
    .insert(tripLiveLocation)
    .values({ offerId, ...position, recordedAt: now })
    .onConflictDoUpdate({
      target: tripLiveLocation.offerId,
      set: { ...position, recordedAt: now },
    });
  await database
    .update(tripOffer)
    .set({
      liveStartedAt: now,
      ...(input.priceCents === undefined
        ? {}
        : {
            priceCents: input.priceCents,
            paymentMethods: input.priceCents ? (input.paymentMethods ?? []) : [],
          }),
    })
    .where(and(eq(tripOffer.id, offerId), eq(tripOffer.driverId, userId)));
  return { active: true, position: { ...position, recordedAt: now.toISOString() } };
}

// Te Jalo off: the position is deleted, so nothing is left of where the car went.
export async function stopLiveLocation(
  database: Database,
  input: { offerId: string; userId: string },
) {
  await ownOffer(database, input.offerId, input.userId);
  await database.delete(tripLiveLocation).where(eq(tripLiveLocation.offerId, input.offerId));
  await database
    .update(tripOffer)
    .set({ liveStartedAt: null })
    .where(eq(tripOffer.id, input.offerId));
  return { active: false, position: null };
}

// Everyone in the community learns whether the trip is live; only the driver and the accepted
// passengers get the position itself.
export async function getLiveLocation(
  database: Database,
  input: { offerId: string; userId: string; now: Date },
) {
  const [offer] = await database
    .select({ driverId: tripOffer.driverId, communityId: tripOffer.communityId })
    .from(tripOffer)
    .where(eq(tripOffer.id, input.offerId))
    .limit(1);
  const [member] = offer
    ? await database
        .select({ id: communityMember.id })
        .from(communityMember)
        .where(
          and(
            eq(communityMember.communityId, offer.communityId),
            eq(communityMember.userId, input.userId),
          ),
        )
        .limit(1)
    : [];
  // Another community gets the same answer as an unknown id, so ids cannot be probed.
  if (!offer || !member) {
    throw new ApiError(404, "No encontramos este viaje.", { code: "offer_not_found" });
  }

  const [stored] = await database
    .select({
      lat: tripLiveLocation.lat,
      lng: tripLiveLocation.lng,
      recordedAt: tripLiveLocation.recordedAt,
    })
    .from(tripLiveLocation)
    .where(
      and(
        eq(tripLiveLocation.offerId, input.offerId),
        gte(tripLiveLocation.recordedAt, freshSince(input.now)),
      ),
    )
    .limit(1);
  if (!stored) return { active: false, position: null };

  let mayFollow = offer.driverId === input.userId;
  if (!mayFollow) {
    const [accepted] = await database
      .select({ id: seatBooking.id })
      .from(seatBooking)
      .where(
        and(
          eq(seatBooking.offerId, input.offerId),
          eq(seatBooking.passengerId, input.userId),
          eq(seatBooking.status, "accepted"),
        ),
      )
      .limit(1);
    mayFollow = Boolean(accepted);
  }
  return {
    active: true,
    position: mayFollow
      ? { lat: stored.lat, lng: stored.lng, recordedAt: stored.recordedAt.toISOString() }
      : null,
  };
}

// Which of these trips have a driver sharing the car right now; feeds the "En vivo" badge.
export async function liveOfferIds(database: Database, offerIds: string[], now: Date) {
  if (offerIds.length === 0) return new Set<string>();
  const rows = await database
    .select({ offerId: tripLiveLocation.offerId })
    .from(tripLiveLocation)
    .where(
      and(
        inArray(tripLiveLocation.offerId, offerIds),
        gte(tripLiveLocation.recordedAt, freshSince(now)),
      ),
    );
  return new Set(rows.map((row) => row.offerId));
}

// The alerts a passenger sees without searching: every trip of their community whose driver
// has Te Jalo on right now and still has a seat. With their location, only the cars within
// ALERT_RADIUS_KM, the closest first.
export async function listLiveAlerts(
  database: Database,
  input: {
    communityId: string;
    userId: string;
    location?: Position;
    now: Date;
  },
  storageForPhotos?: ProfilePhotoStorageResolver,
) {
  const { communityId, userId, location, now } = input;
  const [member] = await database
    .select({
      identifiesAsWoman: communityMember.identifiesAsWoman,
      travelRole: communityMember.travelRole,
    })
    .from(communityMember)
    .where(and(eq(communityMember.communityId, communityId), eq(communityMember.userId, userId)))
    .limit(1);
  // Someone who registered only as a driver is not waiting for a ride.
  if (!member || member.travelRole === "driver") return { alerts: [] };

  const rows = await database
    .select({
      offerId: tripOffer.id,
      driverId: tripOffer.driverId,
      direction: tripOffer.direction,
      originZoneName: sql<string>`coalesce(${tripOffer.originLabel}, ${zone.name})`,
      destinationName: sql<string>`coalesce(${tripOffer.destLabel}, ${community.destinationName})`,
      departureTime: tripOffer.departureTime,
      seatsTotal: tripOffer.seatsTotal,
      womenOnly: tripOffer.womenOnly,
      priceCents: tripOffer.priceCents,
      paymentMethods: tripOffer.paymentMethods,
      lat: tripLiveLocation.lat,
      lng: tripLiveLocation.lng,
      driverAlias: communityMember.alias,
      accountName: userTable.name,
    })
    .from(tripLiveLocation)
    .innerJoin(tripOffer, eq(tripOffer.id, tripLiveLocation.offerId))
    .innerJoin(community, eq(community.id, tripOffer.communityId))
    .innerJoin(zone, eq(zone.id, tripOffer.originZoneId))
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
        ne(tripOffer.driverId, userId),
        gte(tripLiveLocation.recordedAt, freshSince(now)),
      ),
    );
  if (rows.length === 0) return { alerts: [] };

  const accepted = await database
    .select({ offerId: seatBooking.offerId, taken: sql<number>`count(*)::int` })
    .from(seatBooking)
    .where(
      and(
        inArray(
          seatBooking.offerId,
          rows.map((row) => row.offerId),
        ),
        eq(seatBooking.status, "accepted"),
      ),
    )
    .groupBy(seatBooking.offerId);
  const takenBy = new Map(accepted.map((row) => [row.offerId, row.taken]));
  const photoUrls = await getCommunityProfilePhotos(
    database,
    storageForPhotos,
    communityId,
    rows.flatMap((row) => (row.driverId ? [row.driverId] : [])),
  );

  const alerts = rows
    .filter((row) => !row.womenOnly || member.identifiesAsWoman)
    .map((row) => ({
      row,
      free: seatsFree(row.seatsTotal, takenBy.get(row.offerId) ?? 0),
      distanceKm: location ? haversineKm(location, row) : null,
    }))
    .filter(
      ({ free, distanceKm }) => free > 0 && (distanceKm === null || distanceKm <= ALERT_RADIUS_KM),
    )
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    .map(({ row, free, distanceKm }) => ({
      offerId: row.offerId,
      driverName: displayName(row.driverAlias, row.accountName),
      driverPhotoUrl: row.driverId ? (photoUrls.get(row.driverId) ?? null) : null,
      originZoneName: row.originZoneName,
      destinationName: row.destinationName,
      direction: row.direction,
      departureTime: row.departureTime,
      seatsFree: free,
      priceCents: row.priceCents,
      paymentMethods: row.paymentMethods,
      distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
    }));
  return { alerts };
}

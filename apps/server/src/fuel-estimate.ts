import type { db as defaultDb } from "@andes-hack/db";
import { seatBooking } from "@andes-hack/db/schema/trips";
import {
  createTravelTimeModel,
  estimateFuelCost,
  type FuelCostEstimate,
  places,
} from "@andes-hack/matching";
import { and, eq, inArray } from "drizzle-orm";

// The fuel estimate every trip card shows (US-034), computed the same way by search, the
// offer detail, "my trips" and the proposals so the figures never disagree.

type Database = typeof defaultDb;

const model = createTravelTimeModel();
const knownZoneIds = new Set(places.zones.map(({ id }) => id));

// Who shares the fuel: the driver, the accepted passengers, and the person looking when
// they are not aboard yet. A pending request does not count as aboard.
export const occupantsSharingFuel = (acceptedCount: number, viewerAboard: boolean) =>
  1 + acceptedCount + (viewerAboard ? 0 : 1);

// Accepted passengers of each offer, in one query: they hold the seats and share the fuel.
export async function acceptedCountByOffer(database: Database, offerIds: string[]) {
  const counts = new Map<string, number>();
  if (offerIds.length === 0) return counts;
  const accepted = await database
    .select({ offerId: seatBooking.offerId })
    .from(seatBooking)
    .where(and(inArray(seatBooking.offerId, offerIds), eq(seatBooking.status, "accepted")));
  for (const { offerId } of accepted) counts.set(offerId, (counts.get(offerId) ?? 0) + 1);
  return counts;
}

// The leg of an offer: its zone to the community's headquarters (a place the engine knows,
// from destinationOf), or back.
export interface FuelLeg {
  direction: "outbound" | "return";
  originZoneId: string;
  destinationId: string;
  occupants: number;
}

// The estimate of an offer: from its own street route when it runs between two addresses,
// from its zone and the headquarters otherwise.
export function fuelEstimateForOffer(
  offer: { direction: "outbound" | "return"; originZoneId: string; routeKm: number | null },
  destinationId: string,
  occupants: number,
): FuelCostEstimate | null {
  if (offer.routeKm) return estimateFuelCost({ distanceKm: offer.routeKm, occupants });
  return fuelEstimateFor({
    direction: offer.direction,
    originZoneId: offer.originZoneId,
    destinationId,
    occupants,
  });
}

// Null when the engine does not know the zone, so the screen says it could not estimate
// instead of failing the whole response.
export function fuelEstimateFor(leg: FuelLeg): FuelCostEstimate | null {
  const { direction, originZoneId, destinationId, occupants } = leg;
  if (!knownZoneIds.has(originZoneId)) return null;
  const [fromId, toId] =
    direction === "outbound" ? [originZoneId, destinationId] : [destinationId, originZoneId];
  return estimateFuelCost({ distanceKm: model.distanceKm(fromId, toId).km, occupants });
}

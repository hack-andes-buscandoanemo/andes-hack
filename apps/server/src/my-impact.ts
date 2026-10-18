import type { db as defaultDb } from "@andes-hack/db";
import { community } from "@andes-hack/db/schema/community";
import { measureImpact, type CommunityActivity } from "@andes-hack/matching";
import { eq } from "drizzle-orm";

import { loadCommunityActivity } from "./community-activity";

type Database = typeof defaultDb;

// The metrics leave team accounts out because the public panel is evidence of real use. A
// profile shows the person's own trips, whoever drove them.
const withoutTeamFilter = (activity: CommunityActivity): CommunityActivity => ({
  ...activity,
  offers: activity.offers.map((offer) => ({
    ...offer,
    driverIsTeam: false,
    seats: offer.seats.map((seat) => ({ ...seat, passengerIsTeam: false })),
  })),
});

// The person's own impact (US-035), read from the same US-030 metrics as the public panel.
export async function measureMyImpact(
  database: Database,
  input: { communityId: string; userId: string; now: Date },
) {
  const [org] = await database
    .select({
      id: community.id,
      destinationLat: community.destinationLat,
      destinationLng: community.destinationLng,
    })
    .from(community)
    .where(eq(community.id, input.communityId))
    .limit(1);

  // Accepted seats count whether or not the trip was marked completed: the app never marks it.
  const asPassenger = measureImpact(
    withoutTeamFilter(
      await loadCommunityActivity(database, org!, input.now, { passengerId: input.userId }),
    ),
  );
  // As a driver, each offer that carried someone is one shared trip. The car trips it avoided
  // belong to the passengers' profiles, so nothing is counted twice.
  const asDriver = withoutTeamFilter(
    await loadCommunityActivity(database, org!, input.now, { driverId: input.userId }),
  );
  const offersShared = asDriver.offers.filter(
    (offer) => measureImpact({ offers: [offer], openNeeds: [] }).peopleTransported > 0,
  ).length;
  return {
    sharedTrips: asPassenger.peopleTransported + offersShared,
    carTripsAvoided: asPassenger.carTripsAvoided.potential.trips,
    // The detour to pick up someone who came by bus burns CO₂; the community panel keeps that
    // cost, but a profile never shows "CO₂ evitado" below zero.
    co2Kg: Math.max(0, asPassenger.carTripsAvoided.potential.co2Kg),
    fromPublicTransport: asPassenger.fromPublicTransport,
  };
}

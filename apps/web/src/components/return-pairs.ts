import { dateLabel, daysLabel } from "@/app/(app)/buscar/schedule";
import type { MyTrip } from "@/lib/communities-api";

import { commonCalendar } from "./return-trip-card";

export type PairedReturn = { trip: MyTrip; label: string };

const acceptedPassenger = (trip: MyTrip, direction: MyTrip["direction"]) =>
  trip.role === "passenger" && trip.status === "accepted" && trip.direction === direction;

// Links each accepted outbound with the accepted returns of the same community and zone
// that share its date or weekdays. Computed once per list, keyed by the outbound trip id.
//
// Times are compared as same-day "HH:mm" text: a return must leave after the outbound.
// Overnight trips (a return after midnight) are out of scope for a commuting MVP and never pair.
export function pairReturns(trips: MyTrip[]) {
  const returnsByPlace = new Map<string, MyTrip[]>();
  for (const trip of trips) {
    const request = trip.passengerRequest;
    if (!request || !acceptedPassenger(trip, "return")) continue;
    const key = `${request.communityId}:${request.originZoneId}`;
    returnsByPlace.set(key, [...(returnsByPlace.get(key) ?? []), trip]);
  }

  const pairs = new Map<string, PairedReturn[]>();
  for (const trip of trips) {
    const context = trip.passengerRequest;
    if (!context || !acceptedPassenger(trip, "outbound")) continue;
    const found = (
      returnsByPlace.get(`${context.communityId}:${context.originZoneId}`) ?? []
    ).flatMap((candidate) => {
      if (candidate.time.slice(0, 5) <= trip.time.slice(0, 5)) return [];
      const shared = commonCalendar(trip, context, candidate, candidate.passengerRequest!);
      if (!shared) return [];
      return [
        { trip: candidate, label: shared.date ? dateLabel(shared.date) : daysLabel(shared.days) },
      ];
    });
    if (found.length > 0) pairs.set(trip.id, found);
  }
  return pairs;
}

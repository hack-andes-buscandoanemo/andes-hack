import {
  type InfeasibleReason,
  type OfferRoute,
  rankOffersForRequest,
  type RideRequest,
} from "./insertion";
import { avoidsCarTrip, type FallbackMode } from "./metrics";
import type { TravelTimeModel } from "./travel-time";

// Assigns the seats of one day among every passenger still looking for one. Nothing is
// written: the plan is a recommendation each driver still accepts or rejects (US-019).

// An open need, or one with a pending request. `id` is the need's.
export interface DayRequest extends RideRequest {
  id: string;
  // "Si no encuentras viaje, ¿cómo irías?" (US-013).
  fallbackMode: FallbackMode;
}

export interface DayInstance {
  // The day, "YYYY-MM-DD".
  date: string;
  // Their accepted passengers stay where they are; rejected pairs are never proposed.
  offers: readonly OfferRoute[];
  requests: readonly DayRequest[];
}

export interface Assignment {
  requestId: string;
  passengerId: string;
  offerId: string;
  meetingPointId: string;
  pickupAt: string;
  arrivalAt: string;
  detourMinutes: number;
  walkMinutes: number;
  avoidsCarTrip: boolean;
}

export interface Unassigned {
  requestId: string;
  passengerId: string;
  reason: InfeasibleReason;
}

export interface DayPlan {
  assignments: Assignment[];
  unassigned: Unassigned[];
}

export function optimizeDay(instance: DayInstance, model: TravelTimeModel): DayPlan {
  const routes = new Map(instance.offers.map((offer) => [offer.id, offer]));
  const assignments: Assignment[] = [];
  const unassigned: Unassigned[] = [];

  // Whoever would otherwise make the trip by car goes first.
  const queue = instance.requests.toSorted(
    (a, b) => Number(avoidsCarTrip(b.fallbackMode)) - Number(avoidsCarTrip(a.fallbackMode)),
  );
  for (const request of queue) {
    const { matches, reason } = rankOffersForRequest(request, [...routes.values()], model);
    const best = matches[0];
    if (!best) {
      unassigned.push({ requestId: request.id, passengerId: request.passengerId, reason: reason! });
      continue;
    }
    const route = routes.get(best.offerId)!;
    const stop = {
      meetingPointId: best.meetingPointId,
      windowStart: request.windowStart,
      windowEnd: request.windowEnd,
    };
    routes.set(route.id, {
      ...route,
      passengers: route.passengers.toSpliced(best.position, 0, stop),
    });
    assignments.push({
      requestId: request.id,
      passengerId: request.passengerId,
      offerId: best.offerId,
      meetingPointId: best.meetingPointId,
      pickupAt: best.pickupAt,
      arrivalAt: best.arrivalAt,
      detourMinutes: best.detourMinutes,
      walkMinutes: best.walkMinutes,
      avoidsCarTrip: avoidsCarTrip(request.fallbackMode),
    });
  }

  return { assignments, unassigned };
}

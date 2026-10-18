import {
  type InfeasibleReason,
  type OfferMatch,
  type OfferRoute,
  rankOffersForRequest,
  type RideRequest,
  timetable,
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

interface Candidate {
  request: DayRequest;
  // Its feasible offers, best first, on the routes as they stand.
  matches: readonly OfferMatch[];
}

// Minutes lost if the best seat goes to someone else; with one option left, all of them.
const regret = ({ matches }: Candidate) =>
  matches.length > 1
    ? matches[1]!.detourMinutes - matches[0]!.detourMinutes
    : Number.POSITIVE_INFINITY;

const descending = (a: number, b: number) => (a === b ? 0 : a > b ? -1 : 1);

// Who is seated next: whoever would otherwise make the trip by car, then whoever has the
// most to lose by waiting, then whoever costs the driver the fewest minutes.
function seatsFirst(a: Candidate, b: Candidate) {
  return (
    descending(
      Number(avoidsCarTrip(a.request.fallbackMode)),
      Number(avoidsCarTrip(b.request.fallbackMode)),
    ) ||
    descending(regret(a), regret(b)) ||
    a.matches[0]!.detourMinutes - b.matches[0]!.detourMinutes
  );
}

export function optimizeDay(instance: DayInstance, model: TravelTimeModel): DayPlan {
  const routes = new Map(instance.offers.map((offer) => [offer.id, offer]));
  // Who sits at each stop of a route, in its order: a request's id, or null for a
  // passenger the driver had already accepted.
  const riders = new Map(
    instance.offers.map((offer) => [offer.id, offer.passengers.map((): string | null => null)]),
  );
  const seated = new Map<string, Assignment>();
  let waiting = instance.requests;

  // Regret insertion: one passenger per round, until nobody waiting fits anywhere.
  for (;;) {
    const candidates = waiting
      .map((request) => ({
        request,
        matches: rankOffersForRequest(request, [...routes.values()], model).matches,
      }))
      .filter((candidate) => candidate.matches.length > 0);
    // Stable, so a full tie goes to whoever asked first.
    const next = candidates.toSorted(seatsFirst)[0];
    if (!next) break;
    const { request } = next;
    const best = next.matches[0]!;
    waiting = waiting.filter((other) => other !== request);
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
    riders.set(route.id, riders.get(route.id)!.toSpliced(best.position, 0, request.id));
    seated.set(request.id, {
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

  const offers = [...routes.values()];
  // Seating someone ahead of a passenger delays them, so times come from the final routes.
  for (const route of offers) {
    const times = timetable(route, instance.date, model);
    riders.get(route.id)!.forEach((requestId, stop) => {
      const assignment = requestId === null ? undefined : seated.get(requestId);
      if (assignment) seated.set(assignment.requestId, { ...assignment, ...times[stop]! });
    });
  }

  return {
    // In the order the requests came.
    assignments: instance.requests.flatMap((request) => seated.get(request.id) ?? []),
    // Why each one is left out, on the final routes.
    unassigned: waiting.map((request) => ({
      requestId: request.id,
      passengerId: request.passengerId,
      reason: rankOffersForRequest(request, offers, model).reason!,
    })),
  };
}

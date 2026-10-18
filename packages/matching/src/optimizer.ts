import {
  type InfeasibleReason,
  type OfferMatch,
  type OfferRoute,
  rankOffersForRequest,
  type RideRequest,
  timeRoute,
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
  // Index of the stop among all the driver's passengers, those already accepted included.
  position: number;
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

// What the plan maximises, in this order: car trips avoided, then passengers seated, then
// fewer minutes of detour for the drivers, then fewer minutes on foot.
export interface Objective {
  carTripsAvoided: number;
  passengersMatched: number;
  // Each driver's, against the trip with the passengers they had already accepted.
  detourMinutes: number;
  walkMinutes: number;
}

export interface DayPlan {
  assignments: Assignment[];
  unassigned: Unassigned[];
  objective: Objective;
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
      position: best.position,
      pickupAt: best.pickupAt,
      arrivalAt: best.arrivalAt,
      detourMinutes: best.detourMinutes,
      walkMinutes: best.walkMinutes,
      avoidsCarTrip: avoidsCarTrip(request.fallbackMode),
    });
  }

  const offers = [...routes.values()];
  let detourMinutes = 0;
  for (const offer of instance.offers) {
    const ids = riders.get(offer.id)!;
    if (ids.every((requestId) => requestId === null)) continue;
    // Seating someone ahead of a passenger delays them, so times come from the final route.
    const timing = timeRoute(routes.get(offer.id)!, instance.date, model);
    ids.forEach((requestId, stop) => {
      const assignment = requestId === null ? undefined : seated.get(requestId);
      if (assignment)
        seated.set(assignment.requestId, { ...assignment, ...timing.stops[stop]!, position: stop });
    });
    // What the plan adds to the trip the driver already had.
    detourMinutes += Math.round(timing.minutes - timeRoute(offer, instance.date, model).minutes);
  }
  const assignments = instance.requests.flatMap((request) => seated.get(request.id) ?? []);

  return {
    // In the order the requests came.
    assignments,
    // Why each one is left out, on the final routes.
    unassigned: waiting.map((request) => ({
      requestId: request.id,
      passengerId: request.passengerId,
      reason: rankOffersForRequest(request, offers, model).reason!,
    })),
    objective: {
      carTripsAvoided: assignments.filter((assignment) => assignment.avoidsCarTrip).length,
      passengersMatched: assignments.length,
      detourMinutes,
      walkMinutes: assignments.reduce((sum, assignment) => sum + assignment.walkMinutes, 0),
    },
  };
}

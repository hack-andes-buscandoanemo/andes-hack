import { rankOffersForRequest, timeRoute } from "./insertion";
import { avoidsCarTrip } from "./metrics";
import { type Assignment, type DayInstance, type DayPlan, optimizeDay } from "./optimizer";
import type { TravelTimeModel } from "./travel-time";

// What a WhatsApp group or an app that only filters does: each need, in the order it came,
// takes the best offer still feasible, and nobody is moved afterwards.
export function firstComeFirstServed(instance: DayInstance, model: TravelTimeModel): DayPlan {
  const routes = new Map(instance.offers.map((offer) => [offer.id, offer]));
  // Who sits at each stop of a route, in its order: a request's id, or null for a
  // passenger the driver had already accepted.
  const riders = new Map(
    instance.offers.map((offer) => [offer.id, offer.passengers.map((): string | null => null)]),
  );
  const seated = new Map<string, Assignment>();
  const unassigned: DayPlan["unassigned"] = [];

  for (const request of instance.requests) {
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

  let detourMinutes = 0;
  for (const offer of instance.offers) {
    const ids = riders.get(offer.id)!;
    if (ids.every((requestId) => requestId === null)) continue;
    // Someone seated later but ahead on the route delays those before: times and positions
    // come from the final route, as in optimizeDay.
    const timing = timeRoute(routes.get(offer.id)!, instance.date, model);
    ids.forEach((requestId, stop) => {
      const assignment = requestId === null ? undefined : seated.get(requestId);
      if (assignment)
        seated.set(assignment.requestId, { ...assignment, ...timing.stops[stop]!, position: stop });
    });
    detourMinutes += Math.round(timing.minutes - timeRoute(offer, instance.date, model).minutes);
  }
  const assignments = instance.requests.flatMap((request) => seated.get(request.id) ?? []);

  return {
    assignments,
    unassigned,
    objective: {
      carTripsAvoided: assignments.filter((assignment) => assignment.avoidsCarTrip).length,
      passengersMatched: assignments.length,
      detourMinutes,
      walkMinutes: assignments.reduce((sum, assignment) => sum + assignment.walkMinutes, 0),
    },
  };
}

export interface StrategyReport {
  carTripsAvoided: number;
  passengersMatched: number;
  // Share of the day's needs that got a seat, from 0 to 1; 0 on a day without needs.
  coverage: number;
  // All the drivers' together, as the plan's objective counts it.
  detourMinutes: number;
  // Per seated passenger; 0 when nobody was.
  averageDetourMinutes: number;
  averageWalkMinutes: number;
  // How long the strategy took, on the clock given.
  durationMs: number;
  // The day's plan itself, for US-019 to show.
  plan: DayPlan;
}

export interface CompareOptions {
  // The clock, in milliseconds; injected so tests can read a fixed one.
  now?: () => number;
}

export interface StrategyComparison {
  firstComeFirstServed: StrategyReport;
  optimizer: StrategyReport;
}

function report(
  instance: DayInstance,
  strategy: (instance: DayInstance, model: TravelTimeModel) => DayPlan,
  model: TravelTimeModel,
  now: () => number,
): StrategyReport {
  const started = now();
  const plan = strategy(instance, model);
  const durationMs = now() - started;
  const { carTripsAvoided, passengersMatched, detourMinutes, walkMinutes } = plan.objective;
  const needs = instance.requests.length;
  const perPassenger = (total: number) => (passengersMatched > 0 ? total / passengersMatched : 0);
  return {
    carTripsAvoided,
    passengersMatched,
    coverage: needs > 0 ? passengersMatched / needs : 0,
    detourMinutes,
    averageDetourMinutes: perPassenger(detourMinutes),
    averageWalkMinutes: perPassenger(walkMinutes),
    durationMs,
    plan,
  };
}

// Both strategies on the same day, the same rules and the same travel times.
export function compareStrategies(
  instance: DayInstance,
  model: TravelTimeModel,
  { now = Date.now }: CompareOptions = {},
): StrategyComparison {
  return {
    firstComeFirstServed: report(instance, firstComeFirstServed, model, now),
    optimizer: report(instance, optimizeDay, model, now),
  };
}

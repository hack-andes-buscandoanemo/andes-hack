// Solves a fixed set of small random days of Lima (2 or 3 drivers, 6 passengers) by trying
// every assignment, every pickup order and every meeting point, and writes each day's
// seed, size, fingerprint and optimum to src/testing/small-days.json.
// optimizer-optimality.test.ts rebuilds the days from their seeds and compares optimizeDay
// with those literals; this script also prints the gap, for the PR.
//
// Run it by hand when the generator or US-016's rules change: `bun run optima:build`, then
// `bun check` to format the JSON. Routes are checked with src/testing/route-oracle.ts, not
// with insertion.ts, so the optimum does not trust the engine it grades.

import { writeFileSync } from "node:fs";

import {
  type AcceptedPassenger,
  avoidsCarTrip,
  createTravelTimeModel,
  type DayInstance,
  type DayRequest,
  type Objective,
  type OfferRoute,
  optimizeDay,
} from "../src/index";
import { type DaySize, fingerprint, randomDay } from "../src/testing/random-day";
import { pairBreak, routeBreak, tripMinutes } from "../src/testing/route-oracle";

const model = createTravelTimeModel();
const daysWanted = 200;

interface RouteCost {
  detourMinutes: number;
  walkMinutes: number;
}

function* permutations<T>(items: readonly T[]): Generator<T[]> {
  if (items.length === 0) yield [];
  for (const [index, item] of items.entries())
    for (const rest of permutations(items.toSpliced(index, 1))) yield [item, ...rest];
}

// Every way to mix two sequences while keeping the order of each.
function* merges<T>(a: readonly T[], b: readonly T[]): Generator<T[]> {
  if (a.length === 0 || b.length === 0) {
    yield [...a, ...b];
    return;
  }
  for (const rest of merges(a.slice(1), b)) yield [a[0]!, ...rest];
  for (const rest of merges(a, b.slice(1))) yield [b[0]!, ...rest];
}

// Every combination of one walkable meeting point per rider.
function* meetingPoints(riders: readonly DayRequest[]): Generator<Map<string, number>[]> {
  if (riders.length === 0) {
    yield [];
    return;
  }
  const [first, ...rest] = riders;
  for (const point of model.walkableMeetingPoints(first!.originZoneId, first!.maxWalkMinutes))
    for (const others of meetingPoints(rest))
      yield [new Map([[point.meetingPointId, Math.round(point.walkMinutes)]]), ...others];
}

// The cheapest way to add these riders to the offer: fewest detour minutes, then fewest
// minutes on foot; null if no order and no meeting points fit.
function cheapestRoute(offer: OfferRoute, riders: readonly DayRequest[], date: string) {
  const accepted = offer.passengers.map((passenger) => passenger.meetingPointId);
  const base = tripMinutes(offer, accepted, date, model);
  let best: RouteCost | null = null;
  for (const points of meetingPoints(riders)) {
    const stops = riders.map((rider, index): AcceptedPassenger => {
      const [meetingPointId] = points[index]!.keys();
      return { meetingPointId: meetingPointId!, ...windowOf(rider) };
    });
    const walkMinutes = points.reduce((sum, point) => sum + [...point.values()][0]!, 0);
    for (const order of permutations(stops))
      for (const route of merges(offer.passengers, order)) {
        if (routeBreak(offer, route, date, model)) continue;
        const ids = route.map((stop) => stop.meetingPointId);
        const detourMinutes = Math.round(tripMinutes(offer, ids, date, model) - base);
        if (
          !best ||
          detourMinutes < best.detourMinutes ||
          (detourMinutes === best.detourMinutes && walkMinutes < best.walkMinutes)
        )
          best = { detourMinutes, walkMinutes };
      }
  }
  return best;
}

const windowOf = ({ windowStart, windowEnd }: DayRequest) => ({ windowStart, windowEnd });

// Positive when `a` is the better plan.
function compare(a: Objective, b: Objective) {
  return (
    a.carTripsAvoided - b.carTripsAvoided ||
    a.passengersMatched - b.passengersMatched ||
    b.detourMinutes - a.detourMinutes ||
    b.walkMinutes - a.walkMinutes
  );
}

function optimum(instance: DayInstance): Objective {
  const { offers, requests, date } = instance;
  // The offers each passenger could ever ride with.
  const options = requests.map((request) =>
    offers.filter(
      (offer) =>
        offer.passengers.length < offer.seatsTotal &&
        pairBreak(offer, request) === null &&
        model.walkableMeetingPoints(request.originZoneId, request.maxWalkMinutes).length > 0,
    ),
  );
  const costs = new Map<string, RouteCost | null>();
  const costOf = (offer: OfferRoute, riders: readonly DayRequest[]) => {
    const key = `${offer.id}:${riders.map((rider) => rider.id).join(",")}`;
    if (!costs.has(key)) costs.set(key, cheapestRoute(offer, riders, date));
    return costs.get(key)!;
  };

  let best: Objective = {
    carTripsAvoided: 0,
    passengersMatched: 0,
    detourMinutes: 0,
    walkMinutes: 0,
  };
  const chosen = new Map<string, DayRequest[]>(offers.map((offer) => [offer.id, []]));
  const visit = (index: number) => {
    if (index === requests.length) {
      const plan: Objective = {
        carTripsAvoided: 0,
        passengersMatched: 0,
        detourMinutes: 0,
        walkMinutes: 0,
      };
      for (const offer of offers) {
        const riders = chosen.get(offer.id)!;
        if (riders.length === 0) continue;
        const cost = costOf(offer, riders);
        if (!cost) return;
        plan.carTripsAvoided += riders.filter((rider) => avoidsCarTrip(rider.fallbackMode)).length;
        plan.passengersMatched += riders.length;
        plan.detourMinutes += cost.detourMinutes;
        plan.walkMinutes += cost.walkMinutes;
      }
      if (compare(plan, best) > 0) best = plan;
      return;
    }
    visit(index + 1);
    for (const offer of options[index]!) {
      const riders = chosen.get(offer.id)!;
      if (offer.passengers.length + riders.length >= offer.seatsTotal) continue;
      riders.push(requests[index]!);
      visit(index + 1);
      riders.pop();
    }
  };
  visit(0);
  return best;
}

// Days where at most one passenger fits say little about the search, so they are skipped.
const days: { seed: number; size: DaySize; fingerprint: string; optimum: Objective }[] = [];
const instances = new Map<number, DayInstance>();
for (let seed = 1; days.length < daysWanted; seed++) {
  const size = { offers: 2 + (seed % 2), requests: 6 };
  const instance = randomDay(seed, size, model);
  const best = optimum(instance);
  if (best.passengersMatched < 2) continue;
  days.push({ seed, size, fingerprint: fingerprint(instance), optimum: best });
  instances.set(seed, instance);
}

writeFileSync(
  new URL("../src/testing/small-days.json", import.meta.url),
  `${JSON.stringify({ generatedBy: "scripts/exhaustive-optima.ts", days })}\n`,
);

let reached = 0;
for (const { seed, optimum: best } of days) {
  const found = optimizeDay(instances.get(seed)!, model).objective;
  if (compare(found, best) === 0) reached++;
  else
    console.log(
      `seed ${seed}: optimum ${JSON.stringify(best)}, optimizer ${JSON.stringify(found)}`,
    );
}
console.log(`optimizeDay reaches the optimum in ${reached} of ${days.length} days`);

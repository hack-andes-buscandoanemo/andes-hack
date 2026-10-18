import { describe, expect, it } from "vitest";

import {
  type AcceptedPassenger,
  createTravelTimeModel,
  type DayInstance,
  type DayPlan,
  optimizeDay,
} from "./index";
import { randomDay, seededRandom } from "./testing/random-day";
import { pairBreak, routeBreak } from "./testing/route-oracle";

const model = createTravelTimeModel();

// Every rule of US-016 a plan breaks, checked with the oracle rather than insertion.ts,
// so a mistake in the engine cannot hide in its own check.
function brokenRules(instance: DayInstance, plan: DayPlan): string[] {
  const problems: string[] = [];
  const requests = new Map(instance.requests.map((request) => [request.id, request]));
  const seatedOnce = new Set<string>();

  for (const offer of instance.offers) {
    const seated = plan.assignments
      .filter((assignment) => assignment.offerId === offer.id)
      .toSorted((a, b) => a.position - b.position);
    if (seated.length === 0) continue;
    const stops: AcceptedPassenger[] = [...offer.passengers];
    for (const assignment of seated) {
      const request = requests.get(assignment.requestId)!;
      const { passengerId, windowStart, windowEnd } = request;
      if (seatedOnce.has(passengerId)) problems.push(`${passengerId} seated twice`);
      seatedOnce.add(passengerId);
      const pair = pairBreak(offer, request);
      if (pair) problems.push(`${passengerId} with ${offer.id}: ${pair}`);
      if (
        model.walkMinutes(request.originZoneId, assignment.meetingPointId) > request.maxWalkMinutes
      )
        problems.push(`${passengerId}: walks too far`);
      const { meetingPointId } = assignment;
      stops.splice(assignment.position, 0, { meetingPointId, windowStart, windowEnd });
    }
    const route = routeBreak(offer, stops, instance.date, model);
    if (route) problems.push(`${offer.id}: ${route}`);
  }
  return problems;
}

describe("plans for random days of Lima", () => {
  it("never seats anyone beyond the seats, the maximum detour or a time window, over 500 days", () => {
    const random = seededRandom(17);
    const problems: string[] = [];
    let seated = 0;
    for (let day = 0; day < 500; day++) {
      const size = { offers: 1 + Math.floor(random() * 6), requests: Math.floor(random() * 16) };
      const instance = randomDay(day, size, model);
      const plan = optimizeDay(instance, model);
      seated += plan.assignments.length;
      problems.push(...brokenRules(instance, plan).map((problem) => `day ${day}: ${problem}`));
    }

    expect(problems).toEqual([]);
    // Days where nobody fits would prove nothing.
    expect(seated).toBeGreaterThan(500);
  });
});

import { describe, expect, it } from "vitest";

import {
  type AcceptedPassenger,
  createTravelTimeModel,
  type DayInstance,
  type DayPlan,
  optimizeDay,
} from "./index";
import { randomDay, seededRandom } from "./random-day";

const model = createTravelTimeModel();

const minutesOfDay = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

// Every rule of US-016 a plan breaks, checked here leg by leg without insertion.ts, so a
// mistake in the engine cannot hide in its own check.
function brokenRules(instance: DayInstance, plan: DayPlan): string[] {
  const problems: string[] = [];
  const requests = new Map(instance.requests.map((request) => [request.id, request]));
  const seatedOnce = new Set<string>();
  const at = (minutes: number) =>
    new Date(Date.parse(`${instance.date}T00:00:00-05:00`) + minutes * 60_000);

  for (const offer of instance.offers) {
    const outbound = offer.direction === "outbound";
    const seated = plan.assignments
      .filter((assignment) => assignment.offerId === offer.id)
      .toSorted((a, b) => a.position - b.position);
    const stops: AcceptedPassenger[] = [...offer.passengers];
    for (const assignment of seated) {
      const request = requests.get(assignment.requestId)!;
      const { passengerId } = request;
      if (seatedOnce.has(passengerId)) problems.push(`${passengerId} seated twice`);
      seatedOnce.add(passengerId);
      if (request.direction !== offer.direction) problems.push(`${passengerId}: direction`);
      if (request.communityId !== offer.communityId) problems.push(`${passengerId}: community`);
      if (offer.rejectedPassengerIds.includes(passengerId))
        problems.push(`${passengerId}: rejected by ${offer.id}`);
      if (offer.womenOnly && !request.passengerIsWoman)
        problems.push(`${passengerId}: ${offer.id} is women only`);
      if (request.womenOnly && !offer.driverIsWoman)
        problems.push(`${passengerId}: wants a woman driver`);
      if (
        model.walkMinutes(request.originZoneId, assignment.meetingPointId) > request.maxWalkMinutes
      )
        problems.push(`${passengerId}: walks too far`);
      const { windowStart, windowEnd } = request;
      stops.splice(assignment.position, 0, {
        meetingPointId: assignment.meetingPointId,
        windowStart,
        windowEnd,
      });
    }
    if (seated.length === 0) continue;
    if (stops.length > offer.seatsTotal) problems.push(`${offer.id}: more passengers than seats`);

    const tripEnd = (meetingPointIds: readonly string[]) => {
      let clock = minutesOfDay(offer.departureTime);
      let from = outbound ? offer.originZoneId : offer.destinationId;
      for (const to of [...meetingPointIds, outbound ? offer.destinationId : offer.originZoneId]) {
        clock += model.minutes(from, to, at(clock)).minutes;
        from = to;
      }
      return clock;
    };
    const end = tripEnd(stops.map((stop) => stop.meetingPointId));
    if (end - tripEnd([]) > offer.maxDetourMinutes + 1e-9)
      problems.push(`${offer.id}: detour over ${offer.maxDetourMinutes} min`);
    // The window is about the destination: arriving there, or leaving it on the way back.
    const atDestination = outbound ? end : minutesOfDay(offer.departureTime);
    for (const stop of stops) {
      if (
        atDestination < minutesOfDay(stop.windowStart) ||
        atDestination > minutesOfDay(stop.windowEnd)
      )
        problems.push(`${offer.id}: outside a passenger's window`);
    }
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

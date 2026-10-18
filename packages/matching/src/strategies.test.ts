import { describe, expect, it } from "vitest";

import {
  compareStrategies,
  createTravelTimeModel,
  type DayRequest,
  type OfferRoute,
} from "./index";

// The same hand-made corner of Lima as optimizer.test.ts: real coordinates, round free-flow
// minutes, every leg between 7:00 and 7:59 on a weekday (TomTom factor 1.72).
const places = [
  { id: "la-molina", lat: -12.077983, lng: -76.9172838 },
  { id: "surquillo", lat: -12.1144446, lng: -77.011978 },
  { id: "san-borja", lat: -12.107075, lng: -76.9988421 },
  { id: "centro-empresarial-real", lat: -12.0975459, lng: -77.0375707 },
  { id: "san-borja-municipalidad", lat: -12.1071567, lng: -76.9991313 },
];

const meetingPointIds = ["san-borja-municipalidad"];

const freeFlow: Record<string, number> = {
  "la-molina>centro-empresarial-real": 20,
  "la-molina>san-borja-municipalidad": 6,
  "san-borja-municipalidad>centro-empresarial-real": 16,
  "surquillo>centro-empresarial-real": 15,
  "surquillo>san-borja-municipalidad": 2,
};

const ids = places.map((place) => place.id);
const matrix = {
  ids,
  minutes: ids.map((from) =>
    ids.map((to) => (from === to ? 0 : (freeFlow[`${from}>${to}`] ?? null))),
  ),
};

const model = createTravelTimeModel({ places, matrix, meetingPointIds });

// 19 October 2026 is a Monday.
const monday = "2026-10-19";

// Carlos drives from La Molina at 7:00. The San Borja municipalidad costs him
// 6 + 16 − 20 = 2 free-flow minutes, 3.44 with traffic.
function offer(overrides: Partial<OfferRoute> = {}): OfferRoute {
  return {
    id: "carlos",
    communityId: "comunidad-alfa",
    direction: "outbound",
    originZoneId: "la-molina",
    destinationId: "centro-empresarial-real",
    departureTime: "07:00",
    date: null,
    daysOfWeek: [1, 2, 3, 4, 5],
    seatsTotal: 3,
    maxDetourMinutes: 5,
    womenOnly: false,
    driverIsWoman: false,
    rejectedPassengerIds: [],
    passengers: [],
    ...overrides,
  };
}

// Someone from San Borja who wants to arrive between 7:30 and 8:00 and would drive alone.
function request(passengerId: string, overrides: Partial<DayRequest> = {}): DayRequest {
  return {
    id: `necesidad-${passengerId}`,
    passengerId,
    communityId: "comunidad-alfa",
    direction: "outbound",
    originZoneId: "san-borja",
    windowStart: "07:30",
    windowEnd: "08:00",
    date: null,
    daysOfWeek: [1, 2, 3, 4, 5],
    maxWalkMinutes: 15,
    womenOnly: false,
    passengerIsWoman: false,
    fallbackMode: "drive_alone",
    ...overrides,
  };
}

describe("the optimizer against first come, first served", () => {
  it("avoids the car trip that first come, first served gives away", () => {
    // María, who would take the bus, asked before Pedro, who would drive alone, for the
    // only seat.
    const comparison = compareStrategies(
      {
        date: monday,
        offers: [offer({ seatsTotal: 1 })],
        requests: [request("maria", { fallbackMode: "public_transport" }), request("pedro")],
      },
      model,
    );

    expect(comparison.firstComeFirstServed.carTripsAvoided).toBe(0);
    expect(comparison.optimizer.carTripsAvoided).toBe(1);
  });

  it("measures each strategy's detour and walk the way US-030 does", () => {
    // Two seats: María (bus) and Pedro (would drive alone) both fit, each picked up at the
    // municipalidad, 1 min on foot. First come seats María then Pedro; the optimizer, Pedro
    // then María. Either way Carlos loses 6 + 16 − 20 = 2 free-flow min, 3.44 with traffic.
    const comparison = compareStrategies(
      {
        date: monday,
        offers: [offer({ seatsTotal: 2 })],
        requests: [request("maria", { fallbackMode: "public_transport" }), request("pedro")],
      },
      model,
    );

    for (const strategy of [comparison.firstComeFirstServed, comparison.optimizer]) {
      expect(strategy).toMatchObject({
        carTripsAvoided: 1,
        passengersMatched: 2,
        coverage: 1,
        detourMinutes: 3,
        averageDetourMinutes: 1.5,
        averageWalkMinutes: 1,
      });
    }
  });

  it("times each strategy on the injected clock", () => {
    // The clock is read before and after each strategy, first come first.
    const ticks = [1000, 1004, 1004, 1013];
    const now = () => ticks.shift()!;

    const comparison = compareStrategies(
      { date: monday, offers: [offer()], requests: [request("pedro")] },
      model,
      { now },
    );

    expect(comparison.firstComeFirstServed.durationMs).toBe(4);
    expect(comparison.optimizer.durationMs).toBe(9);
  });

  it("hands over each strategy's plan, so US-019 can show who sits where", () => {
    const comparison = compareStrategies(
      { date: monday, offers: [offer()], requests: [request("pedro")] },
      model,
    );

    expect(comparison.optimizer.plan.assignments).toMatchObject([
      { passengerId: "pedro", offerId: "carlos", meetingPointId: "san-borja-municipalidad" },
    ]);
    expect(comparison.firstComeFirstServed.plan.assignments).toEqual(
      comparison.optimizer.plan.assignments,
    );
  });

  it("holds first come, first served to the same rules: a taken seat is gone", () => {
    const comparison = compareStrategies(
      {
        date: monday,
        offers: [offer({ seatsTotal: 1 })],
        requests: [request("maria", { fallbackMode: "public_transport" }), request("pedro")],
      },
      model,
    );

    expect(comparison.firstComeFirstServed.plan).toMatchObject({
      assignments: [{ passengerId: "maria", offerId: "carlos" }],
      unassigned: [{ requestId: "necesidad-pedro", passengerId: "pedro", reason: "no_seats" }],
    });
  });

  it("reports an empty day as nobody matched and no coverage, without failing", () => {
    const comparison = compareStrategies({ date: monday, offers: [], requests: [] }, model);

    for (const strategy of [comparison.firstComeFirstServed, comparison.optimizer]) {
      expect(strategy.passengersMatched).toBe(0);
      expect(strategy.coverage).toBe(0);
    }
  });
});

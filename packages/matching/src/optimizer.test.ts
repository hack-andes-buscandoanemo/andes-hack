import { describe, expect, it } from "vitest";

import { createTravelTimeModel, type DayRequest, type OfferRoute, optimizeDay } from "./index";

// Real coordinates, hand-made free-flow minutes. Every leg starts between 7:00 and 7:59
// on a weekday and takes the TomTom factor of 7:00, 1.72.
const places = [
  { id: "la-molina", lat: -12.077983, lng: -76.9172838 },
  { id: "surquillo", lat: -12.1144446, lng: -77.011978 },
  { id: "san-borja", lat: -12.107075, lng: -76.9988421 },
  { id: "centro-empresarial-real", lat: -12.0975459, lng: -77.0375707 },
  { id: "san-borja-municipalidad", lat: -12.1071567, lng: -76.9991313 },
  { id: "la-molina-plaza-de-armas", lat: -12.0780067, lng: -76.917343 },
];

// From the San Borja zone the municipalidad is 0.56 min away on foot; the plaza de armas
// is next to the La Molina zone.
const meetingPointIds = ["san-borja-municipalidad", "la-molina-plaza-de-armas"];

const freeFlow: Record<string, number> = {
  "la-molina>centro-empresarial-real": 20,
  "la-molina>san-borja-municipalidad": 6,
  "san-borja-municipalidad>centro-empresarial-real": 16,
  // Lucía drives from Surquillo: the municipalidad costs her 2 + 16 − 15 = 3 minutes.
  "surquillo>centro-empresarial-real": 15,
  "surquillo>san-borja-municipalidad": 2,
  // Through the plaza de armas Carlos takes 1 + 22 = 23 min alone, 1 + 6 + 16 = 23 with
  // the municipalidad after it, and much longer the other way round.
  "la-molina>la-molina-plaza-de-armas": 1,
  "la-molina-plaza-de-armas>centro-empresarial-real": 22,
  "la-molina-plaza-de-armas>san-borja-municipalidad": 6,
  "san-borja-municipalidad>la-molina-plaza-de-armas": 9,
};

const ids = places.map((place) => place.id);

function modelWith(minutes: Record<string, number>) {
  const matrix = {
    ids,
    minutes: ids.map((from) =>
      ids.map((to) => (from === to ? 0 : (minutes[`${from}>${to}`] ?? null))),
    ),
  };
  return createTravelTimeModel({ places, matrix, meetingPointIds });
}

const model = modelWith(freeFlow);

// 19 October 2026 is a Monday.
const monday = "2026-10-19";

// Carlos drives from La Molina at 7:00. Picking someone up at the San Borja
// municipalidad costs him 6 + 16 − 20 = 2 free-flow minutes, 3.44 with traffic.
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

// Lucía leaves Surquillo at 7:20; through the municipalidad she arrives at
// 7:20 + 18 × 1.72 = 7:51. Carlos arrives at 7:38.
const lucia = offer({
  id: "lucia",
  originZoneId: "surquillo",
  departureTime: "07:20",
  seatsTotal: 1,
  maxDetourMinutes: 10,
});

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

describe("seats of a day assigned to maximise the car trips avoided", () => {
  it("gives the last seat to Pedro, who would drive alone, over María, who asked first and would take the bus", () => {
    const plan = optimizeDay(
      {
        date: monday,
        offers: [offer({ seatsTotal: 1 })],
        requests: [request("maria", { fallbackMode: "public_transport" }), request("pedro")],
      },
      model,
    );

    expect(plan.assignments.map(({ passengerId, offerId }) => [passengerId, offerId])).toEqual([
      ["pedro", "carlos"],
    ]);
    expect(plan.unassigned).toEqual([
      { requestId: "necesidad-maria", passengerId: "maria", reason: "no_seats" },
    ]);
  });

  // Ana fits in both cars and costs Carlos less (3 min against Lucía's 5); Bruno must arrive
  // by 7:45, so only Carlos takes him.
  const ana = request("ana", { windowEnd: "08:30" });
  const bruno = request("bruno", { windowEnd: "07:45" });

  it("seats first the passenger with fewer options, so both fit", () => {
    const plan = optimizeDay(
      { date: monday, offers: [offer({ seatsTotal: 1 }), lucia], requests: [ana, bruno] },
      model,
    );

    expect(plan.assignments.map(({ passengerId, offerId }) => [passengerId, offerId])).toEqual([
      ["ana", "lucia"],
      ["bruno", "carlos"],
    ]);
    expect(plan.unassigned).toEqual([]);
  });

  it("moves someone who would drive to another car to make room for a bus rider who fits only there", () => {
    // Ana goes first because she would drive, and takes Carlos's cheaper seat; moving her
    // to Lucía keeps her car trip avoided and seats Bruno too.
    const busRider = { ...bruno, fallbackMode: "public_transport" as const };

    const plan = optimizeDay(
      { date: monday, offers: [offer({ seatsTotal: 1 }), lucia], requests: [ana, busRider] },
      model,
    );

    expect(plan.assignments.map(({ passengerId, offerId }) => [passengerId, offerId])).toEqual([
      ["ana", "lucia"],
      ["bruno", "carlos"],
    ]);
  });

  it("seats together two passengers the driver would bring too early one by one", () => {
    // With 7 min from the plaza to the municipalidad, Carlos arrives at 7:00 + 22 × 1.72 =
    // 7:38 with Pedro alone and at 7:40 with Sofía alone, both before 7:40:00; with Sofía
    // and then Pedro, 1 + 7 + 16 = 24 min, at 7:41, and 4 × 1.72 = 6.9 min of detour.
    const slowerPlaza = modelWith({
      ...freeFlow,
      "la-molina-plaza-de-armas>san-borja-municipalidad": 7,
    });
    const late = { windowStart: "07:40", windowEnd: "08:00" };

    const plan = optimizeDay(
      {
        date: monday,
        offers: [offer({ maxDetourMinutes: 10 })],
        requests: [
          request("pedro", late),
          request("sofia", { ...late, originZoneId: "la-molina" }),
        ],
      },
      slowerPlaza,
    );

    expect(plan.assignments.map(({ passengerId, position }) => [passengerId, position])).toEqual([
      ["pedro", 1],
      ["sofia", 0],
    ]);
  });

  describe("when Pedro, who would drive, and two bus riders cannot share the car", () => {
    // Carlos accepts 6 min. Pedro at the plaza costs him 3 × 1.72 = 5.2; María and José at
    // the municipalidad, 2 × 1.72 = 3.4 together. With 9 min from the plaza to the
    // municipalidad, Pedro and either of them would cost 6 × 1.72 = 10.3.
    const farPlaza = modelWith({
      ...freeFlow,
      "la-molina-plaza-de-armas>san-borja-municipalidad": 9,
    });
    const day = {
      date: monday,
      offers: [offer({ seatsTotal: 2, maxDetourMinutes: 6 })],
      requests: [
        request("pedro", { originZoneId: "la-molina" }),
        request("maria", { fallbackMode: "public_transport" }),
        request("jose", { fallbackMode: "public_transport" }),
      ],
    };
    const seated = (plan: { assignments: { passengerId: string }[] }) =>
      plan.assignments.map(({ passengerId }) => passengerId);

    it("takes Pedro, to avoid a car trip", () => {
      expect(seated(optimizeDay(day, farPlaza))).toEqual(["pedro"]);
    });

    it("reports who was seated and who was left out by how they would travel otherwise", () => {
      expect(optimizeDay(day, farPlaza).metrics).toEqual({
        matched: { wouldDrive: 1, publicTransport: 0, other: 0 },
        unassigned: { wouldDrive: 0, publicTransport: 2, other: 0 },
      });
    });

    it("takes the two bus riders when the priority is the passengers seated", () => {
      expect(seated(optimizeDay(day, farPlaza, { priority: "passengers" }))).toEqual([
        "maria",
        "jose",
      ]);
    });
  });

  it("reports each passenger's times on the final route, after everyone is seated", () => {
    // Pedro costs Carlos 2 min and is seated first, picked up at 7:00 + 6 × 1.72 = 7:10.
    // Sofía, 3 min alone, goes before him at the plaza: 7:00 + 1 × 1.72 = 7:02, which
    // pushes Pedro to 7:00 + 7 × 1.72 = 7:12. Both arrive at 7:00 + 23 × 1.72 = 7:40.
    const plan = optimizeDay(
      {
        date: monday,
        offers: [offer({ maxDetourMinutes: 10 })],
        requests: [request("pedro"), request("sofia", { originZoneId: "la-molina" })],
      },
      model,
    );

    expect(
      plan.assignments.map(({ passengerId, meetingPointId, pickupAt, arrivalAt }) => [
        passengerId,
        meetingPointId,
        pickupAt,
        arrivalAt,
      ]),
    ).toEqual([
      ["pedro", "san-borja-municipalidad", "07:12", "07:40"],
      ["sofia", "la-molina-plaza-de-armas", "07:02", "07:40"],
    ]);
  });

  it("places each passenger in the order the driver picks them up, after those already accepted", () => {
    const acceptedAtThePlaza = {
      meetingPointId: "la-molina-plaza-de-armas",
      windowStart: "07:30",
      windowEnd: "08:00",
    };

    const plan = optimizeDay(
      {
        date: monday,
        offers: [offer({ maxDetourMinutes: 10, passengers: [acceptedAtThePlaza] })],
        requests: [request("pedro")],
      },
      model,
    );

    expect(plan.assignments.map(({ passengerId, position }) => [passengerId, position])).toEqual([
      ["pedro", 1],
    ]);
  });

  it("scores the plan by car trips avoided, passengers, then the drivers' detour and the walk", () => {
    const plan = optimizeDay(
      {
        date: monday,
        offers: [offer({ maxDetourMinutes: 10 })],
        requests: [
          request("pedro"),
          request("sofia", { originZoneId: "la-molina", fallbackMode: "public_transport" }),
        ],
      },
      model,
    );

    // Carlos goes from 20 to 23 free-flow min: 3 × 1.72 = 5.16. Pedro walks 0.56 min and
    // Sofía a few metres.
    expect(plan.objective).toEqual({
      carTripsAvoided: 1,
      passengersMatched: 2,
      detourMinutes: 5,
      walkMinutes: 1,
    });
  });
});

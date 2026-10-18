import { describe, expect, it } from "vitest";

import { createTravelTimeModel, type DayRequest, type OfferRoute, optimizeDay } from "./index";

// Real coordinates, hand-made free-flow minutes. Every leg starts between 7:00 and 7:59
// on a weekday and takes the TomTom factor of 7:00, 1.72.
const places = [
  { id: "la-molina", lat: -12.077983, lng: -76.9172838 },
  { id: "san-borja", lat: -12.107075, lng: -76.9988421 },
  { id: "centro-empresarial-real", lat: -12.0975459, lng: -77.0375707 },
  { id: "san-borja-municipalidad", lat: -12.1071567, lng: -76.9991313 },
];

// From the San Borja zone the municipalidad is 0.56 min away on foot.
const meetingPointIds = ["san-borja-municipalidad"];

const freeFlow: Record<string, number> = {
  "la-molina>centro-empresarial-real": 20,
  "la-molina>san-borja-municipalidad": 6,
  "san-borja-municipalidad>centro-empresarial-real": 16,
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
});

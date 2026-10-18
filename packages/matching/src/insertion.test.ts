import { describe, expect, it } from "vitest";

import {
  bestInsertion,
  createTravelTimeModel,
  type OfferRoute,
  rankOffersForRequest,
  type RideRequest,
} from "./index";

// Real coordinates, hand-made free-flow minutes. Unless a test says otherwise, every leg
// starts between 7:00 and 7:59 on a weekday and takes the TomTom factor of 7:00, 1.72.
const places = [
  { id: "la-molina", lat: -12.077983, lng: -76.9172838 },
  { id: "surquillo", lat: -12.1144446, lng: -77.011978 },
  { id: "san-borja", lat: -12.107075, lng: -76.9988421 },
  { id: "centro-empresarial-real", lat: -12.0975459, lng: -77.0375707 },
  { id: "surquillo-municipalidad", lat: -12.1127387, lng: -77.0108894 },
  { id: "san-borja-municipalidad", lat: -12.1071567, lng: -76.9991313 },
  { id: "san-borja-estacion-san-borja-sur", lat: -12.1004192, lng: -77.001846 },
];

// From the San Borja zone the municipalidad is 0.56 min away on foot, the station 13.91
// min and Surquillo's municipalidad 25 min.
const meetingPointIds = [
  "surquillo-municipalidad",
  "san-borja-municipalidad",
  "san-borja-estacion-san-borja-sur",
];

const freeFlow: Record<string, number> = {
  "la-molina>centro-empresarial-real": 20,
  "la-molina>surquillo-municipalidad": 8,
  "surquillo-municipalidad>centro-empresarial-real": 13,
  "la-molina>san-borja-municipalidad": 6,
  "san-borja-municipalidad>surquillo-municipalidad": 4,
  "surquillo-municipalidad>san-borja-municipalidad": 5,
  "san-borja-municipalidad>centro-empresarial-real": 16,
  "la-molina>san-borja-estacion-san-borja-sur": 10,
  "san-borja-estacion-san-borja-sur>surquillo-municipalidad": 3,
  "surquillo-municipalidad>san-borja-estacion-san-borja-sur": 4,
  "san-borja-estacion-san-borja-sur>centro-empresarial-real": 10,
  // A driver from Surquillo has the municipalidad on the way.
  "surquillo>centro-empresarial-real": 18,
  "surquillo>san-borja-municipalidad": 2,
  "surquillo>san-borja-estacion-san-borja-sur": 9,
  // The way back.
  "centro-empresarial-real>la-molina": 20,
  "centro-empresarial-real>san-borja-municipalidad": 15,
  "san-borja-municipalidad>la-molina": 7,
  "centro-empresarial-real>san-borja-estacion-san-borja-sur": 9,
  "san-borja-estacion-san-borja-sur>la-molina": 11,
};

const ids = places.map((place) => place.id);
const matrix = {
  ids,
  minutes: ids.map((from) =>
    ids.map((to) => (from === to ? 0 : (freeFlow[`${from}>${to}`] ?? null))),
  ),
};

const model = createTravelTimeModel({ places, matrix, meetingPointIds });

function offer(overrides: Partial<OfferRoute> = {}): OfferRoute {
  return {
    id: "oferta-1",
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

function need(overrides: Partial<RideRequest> = {}): RideRequest {
  return {
    passengerId: "pasajera-1",
    communityId: "comunidad-alfa",
    direction: "outbound",
    originZoneId: "san-borja",
    windowStart: "07:30",
    windowEnd: "08:00",
    date: null,
    daysOfWeek: [1, 2, 3, 4, 5],
    maxWalkMinutes: 15,
    womenOnly: false,
    passengerIsWoman: true,
    ...overrides,
  };
}

// Already accepted: picked up in Surquillo. Alone with the driver the route is 8 + 13 = 21
// free-flow minutes, one more than going straight (20).
const acceptedInSurquillo = {
  meetingPointId: "surquillo-municipalidad",
  windowStart: "07:30",
  windowEnd: "08:00",
};

describe("best insertion of a passenger in a driver's route", () => {
  it("picks the meeting point and position that add the fewest minutes to the driver", () => {
    const result = bestInsertion(offer({ passengers: [acceptedInSurquillo] }), need(), model);

    // After Surquillo, at the station: 8 + 4 + 10 = 22 free-flow min, 1 more than now
    // (× 1.72 = 1.72 min) and 2 more than going straight (3.44 ≤ 5). Picked up at
    // 7:00 + 12 × 1.72 = 7:20.6; everyone arrives at 7:00 + 22 × 1.72 = 7:37.8, inside
    // both windows. The municipalidad first would make the route 23 min: 5.16 > 5.
    expect(result).toEqual({
      feasible: true,
      meetingPointId: "san-borja-estacion-san-borja-sur",
      position: 1,
      pickupAt: "07:21",
      arrivalAt: "07:38",
      detourMinutes: 2,
      walkMinutes: 14,
    });
  });

  it("rejects the insertion when the only walkable point is off the route of a driver who accepts no detour", () => {
    // Within 5 min on foot there is only the municipalidad: 6 + 16 = 22 free-flow min
    // instead of 20 straight, 3.44 min more for a driver who accepts 0.
    const result = bestInsertion(
      offer({ maxDetourMinutes: 0 }),
      need({ maxWalkMinutes: 5 }),
      model,
    );

    expect(result).toEqual({ feasible: false, reason: "detour_exceeded" });
  });

  it("counts the detour of every passenger, not only the new one, against the driver's maximum", () => {
    // Only the municipalidad is walkable. First in the route: 6 + 4 + 13 = 23 free-flow
    // min, 2 more than now (3.44 ≤ 5) but 3 more than straight (5.16 > 5).
    const result = bestInsertion(
      offer({ passengers: [acceptedInSurquillo] }),
      need({ maxWalkMinutes: 5 }),
      model,
    );

    expect(result).toEqual({ feasible: false, reason: "detour_exceeded" });
  });

  it("rejects the insertion when the driver would arrive outside the passenger's window", () => {
    // Every way of picking her up arrives before 7:50.
    const result = bestInsertion(
      offer({ passengers: [acceptedInSurquillo] }),
      need({ windowStart: "08:00", windowEnd: "08:30" }),
      model,
    );

    expect(result).toEqual({ feasible: false, reason: "outside_time_window" });
  });

  it("keeps every accepted passenger inside their own window", () => {
    // Today they arrive at 7:36.1 (21 × 1.72); the best insertion would bring them at 7:37.8.
    const tight = { ...acceptedInSurquillo, windowEnd: "07:37" };

    const result = bestInsertion(offer({ passengers: [tight] }), need(), model);

    expect(result).toEqual({ feasible: false, reason: "outside_time_window" });
  });

  it("rejects a passenger with no meeting point within the walk they accept", () => {
    // From La Molina every meeting point of this map is over two hours away on foot.
    const result = bestInsertion(offer(), need({ originZoneId: "la-molina" }), model);

    expect(result).toEqual({ feasible: false, reason: "no_walkable_meeting_point" });
  });

  it("rejects a passenger when the driver's seats are all taken", () => {
    const full = offer({ seatsTotal: 1, passengers: [acceptedInSurquillo] });

    expect(bestInsertion(full, need(), model)).toEqual({ feasible: false, reason: "no_seats" });
  });

  it("only matches members of the same community", () => {
    const result = bestInsertion(offer({ communityId: "comunidad-beta" }), need(), model);

    expect(result).toEqual({ feasible: false, reason: "different_community" });
  });

  it("rejects a recurring need on a day the driver does not go", () => {
    const result = bestInsertion(offer(), need({ daysOfWeek: [1, 6] }), model);

    expect(result).toEqual({ feasible: false, reason: "days_mismatch" });
  });

  it("rejects a one-off need on a date the driver does not go", () => {
    // 25 October 2026 is a Sunday.
    const result = bestInsertion(offer(), need({ daysOfWeek: null, date: "2026-10-25" }), model);

    expect(result).toEqual({ feasible: false, reason: "days_mismatch" });
  });

  it("matches a one-off need with a one-off offer on the same date", () => {
    const onMonday = { daysOfWeek: null, date: "2026-10-19" };

    const result = bestInsertion(offer(onMonday), need(onMonday), model);

    expect(result.feasible).toBe(true);
  });

  it("times a one-off trip with the traffic of its own date", () => {
    // 24 October 2026 is a Saturday: weekend factor 1.3. The station is on the way
    // (10 + 10 = 20 free-flow min, as straight): picked up at 7:13, arriving at 7:26.
    const onSaturday = { daysOfWeek: null, date: "2026-10-24" };

    const result = bestInsertion(
      offer(onSaturday),
      need({ ...onSaturday, windowStart: "07:15", windowEnd: "07:45" }),
      model,
    );

    expect(result).toEqual({
      feasible: true,
      meetingPointId: "san-borja-estacion-san-borja-sur",
      position: 0,
      pickupAt: "07:13",
      arrivalAt: "07:26",
      detourMinutes: 0,
      walkMinutes: 14,
    });
  });

  it("times a recurring trip on the first of its days", () => {
    // Saturdays and Sundays: weekend traffic, as on the one-off Saturday above.
    const weekends = { daysOfWeek: [6, 7] };

    const result = bestInsertion(
      offer(weekends),
      need({ ...weekends, windowStart: "07:15", windowEnd: "07:45" }),
      model,
    );

    expect(result).toMatchObject({ pickupAt: "07:13", arrivalAt: "07:26" });
  });

  it("keeps a women-only offer away from a passenger who does not identify as a woman", () => {
    const result = bestInsertion(
      offer({ womenOnly: true, driverIsWoman: true }),
      need({ passengerIsWoman: false }),
      model,
    );

    expect(result).toEqual({ feasible: false, reason: "women_only" });
  });

  it("keeps a passenger who asked for women only away from a driver who is not a woman", () => {
    const result = bestInsertion(offer({ driverIsWoman: false }), need({ womenOnly: true }), model);

    expect(result).toEqual({ feasible: false, reason: "women_only" });
  });

  it("never offers again a seat the driver already turned down for that passenger", () => {
    const result = bestInsertion(offer({ rejectedPassengerIds: ["pasajera-1"] }), need(), model);

    expect(result).toEqual({ feasible: false, reason: "previously_rejected" });
  });

  it("on the way back, boards the passenger at the destination and drops her off on the route", () => {
    // Leaving at 18:00, inside her 17:45-18:15 window. The station is on the way home
    // (9 + 11 = 20 free-flow min, as straight); at 18:00 the factor is 2.31, so she is
    // dropped off at 18:00 + 9 × 2.31 = 18:20.8.
    const back = { direction: "return" as const };

    const result = bestInsertion(
      offer({ ...back, departureTime: "18:00" }),
      need({ ...back, windowStart: "17:45", windowEnd: "18:15" }),
      model,
    );

    expect(result).toEqual({
      feasible: true,
      meetingPointId: "san-borja-estacion-san-borja-sur",
      position: 0,
      pickupAt: "18:00",
      arrivalAt: "18:21",
      detourMinutes: 0,
      walkMinutes: 14,
    });
  });
});

describe("pairing a need with an offer", () => {
  it("refuses an offer that goes the other way", () => {
    expect(() => bestInsertion(offer({ direction: "return" }), need(), model)).toThrow(
      "La oferta y la necesidad van en sentidos distintos",
    );
  });
});

describe("ranking the offers for a passenger's need", () => {
  it("lists the compatible offers with the smallest detour first", () => {
    // With a passenger already in Surquillo she costs the driver 2 min; alone, 0.
    const withPassenger = offer({ id: "oferta-a", passengers: [acceptedInSurquillo] });
    const alone = offer({ id: "oferta-c" });

    const { matches } = rankOffersForRequest(need(), [withPassenger, alone], model);

    expect(matches.map((match) => match.offerId)).toEqual(["oferta-c", "oferta-a"]);
  });

  it("breaks a tie in detour with the shorter walk", () => {
    // Both cost the driver nothing: from La Molina she walks 14 min to the station; from
    // Surquillo (2 + 16 = 18 free-flow min, as straight) 1 min to the municipalidad.
    const fromLaMolina = offer({ id: "oferta-c" });
    const fromSurquillo = offer({
      id: "oferta-e",
      originZoneId: "surquillo",
      departureTime: "07:05",
    });

    const { matches } = rankOffersForRequest(need(), [fromLaMolina, fromSurquillo], model);

    expect(matches.map((match) => match.offerId)).toEqual(["oferta-e", "oferta-c"]);
  });

  it("then prefers the arrival closest to the middle of her window", () => {
    // Same detour and walk. Leaving at 7:05 arrives at 7:39, 6 min from 7:45; leaving at
    // 7:00 arrives at 7:34, 11 min away.
    const at7 = offer({ id: "oferta-c" });
    const at705 = offer({ id: "oferta-b", departureTime: "07:05" });

    const { matches } = rankOffersForRequest(need(), [at7, at705], model);

    expect(matches.map((match) => match.offerId)).toEqual(["oferta-b", "oferta-c"]);
  });

  it("orders offers that tie on everything by id, whatever order they come in", () => {
    const twins = [offer({ id: "oferta-d" }), offer({ id: "oferta-b" })];

    const { matches } = rankOffersForRequest(need(), twins, model);

    expect(matches.map((match) => match.offerId)).toEqual(["oferta-b", "oferta-d"]);
  });

  it("explains an empty result with the reason that turned down most offers", () => {
    const full = { seatsTotal: 1, passengers: [acceptedInSurquillo] };
    const offers = [
      offer({ id: "oferta-a", ...full }),
      offer({ id: "oferta-b", ...full }),
      // At 6:00 the factor is 1.48: it arrives at 6:30, before her window.
      offer({ id: "oferta-c", departureTime: "06:00" }),
    ];

    expect(rankOffersForRequest(need(), offers, model)).toEqual({
      matches: [],
      reason: "no_seats",
    });
  });

  it("settles a tie between reasons with the one checked first", () => {
    const offers = [
      offer({ id: "oferta-a", seatsTotal: 1, passengers: [acceptedInSurquillo] }),
      offer({ id: "oferta-c", departureTime: "06:00" }),
    ];

    expect(rankOffersForRequest(need(), offers, model).reason).toBe("no_seats");
  });

  it("leaves out the offers that go the other way", () => {
    const offers = [offer({ id: "oferta-r", direction: "return" }), offer({ id: "oferta-c" })];

    const { matches } = rankOffersForRequest(need(), offers, model);

    expect(matches.map((match) => match.offerId)).toEqual(["oferta-c"]);
  });

  it("says no driver leaves at that time when there are no offers at all", () => {
    expect(rankOffersForRequest(need(), [], model)).toEqual({
      matches: [],
      reason: "outside_time_window",
    });
  });
});

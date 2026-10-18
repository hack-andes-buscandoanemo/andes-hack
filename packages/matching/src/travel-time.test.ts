import { describe, expect, it } from "vitest";

import { createTravelTimeModel } from "./index";

// A hand-made matrix: real coordinates, but round free-flow minutes so the expected
// values can be worked out by hand.
const places = [
  { id: "la-molina", lat: -12.077983, lng: -76.9172838 },
  { id: "san-isidro", lat: -12.0989209, lng: -77.0346439 },
];

const matrix = {
  ids: ["la-molina", "san-isidro"],
  minutes: [
    [0, 20],
    [22, 0],
  ],
};

// 19 October 2026 is a Monday; times are written in Lima (UTC−5).
const mondayAt = (time: string) => new Date(`2026-10-19T${time}:00-05:00`);

describe("travel times between places of Lima", () => {
  it("multiplies the free-flow time by 2.01 when leaving at 8:00 on a weekday", () => {
    const model = createTravelTimeModel({ places, matrix });

    const trip = model.minutes("la-molina", "san-isidro", mondayAt("08:00"));

    expect(trip.minutes).toBeCloseTo(40.2);
    expect(trip.kind).toBe("dato");
  });

  it("interpolates the factor of an hour without TomTom data and labels the time as estimated", () => {
    const model = createTravelTimeModel({ places, matrix });

    // 13:00 sits 4/9 of the way from 9:00 (1.92) to 18:00 (2.31): factor 2.0933.
    const trip = model.minutes("la-molina", "san-isidro", mondayAt("13:00"));

    expect(trip.minutes).toBeCloseTo(41.87, 2);
    expect(trip.kind).toBe("estimado");
  });

  it("assumes free flow in the small hours", () => {
    const model = createTravelTimeModel({ places, matrix });

    const trip = model.minutes("la-molina", "san-isidro", mondayAt("03:00"));

    expect(trip.minutes).toBeCloseTo(20);
    expect(trip.kind).toBe("estimado");
  });

  it("uses the weekend factor on a Sunday evening in Lima, already Monday in UTC", () => {
    const model = createTravelTimeModel({ places, matrix });

    const trip = model.minutes("la-molina", "san-isidro", new Date("2026-10-25T20:00:00-05:00"));

    expect(trip.minutes).toBeCloseTo(26);
    expect(trip.kind).toBe("estimado");
  });
});

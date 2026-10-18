import { describe, expect, it } from "vitest";

import { createTravelTimeModel, places as limaPlaces } from "./index";

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

  it("estimates a pair that is not in the matrix from the distance and labels it as estimated", () => {
    const model = createTravelTimeModel({
      places: [
        ...places,
        { id: "miraflores", lat: -12.1206214, lng: -77.0294993 },
        { id: "barranco", lat: -12.1496977, lng: -77.0212908 },
      ],
      matrix,
    });

    // 3.354 km in a straight line × 1.29 road km per straight km ÷ 42.5 km/h, at free flow.
    const trip = model.minutes("miraflores", "barranco", mondayAt("03:00"));

    expect(trip.minutes).toBeCloseTo(6.11, 2);
    expect(trip.kind).toBe("estimado");
  });

  it("estimates the walk from a zone to a meeting point at 4.5 km/h", () => {
    const model = createTravelTimeModel({
      places: [...places, { id: "parque-la-balsa", lat: -12.0839519, lng: -76.9209402 }],
      matrix,
    });

    // 0.774 km in a straight line × 1.29 road km per straight km ÷ 4.5 km/h.
    expect(model.walkMinutes("la-molina", "parque-la-balsa")).toBeCloseTo(13.31, 2);
  });

  it("refuses an invalid departure date", () => {
    const model = createTravelTimeModel({ places, matrix });

    expect(() => model.minutes("la-molina", "san-isidro", new Date("8:00"))).toThrow(
      "Fecha de salida inválida",
    );
  });
});

describe("travel times with the real places of Lima", () => {
  it("takes about 42 minutes from La Molina to the Centro Empresarial Real at 8:00 on a weekday", () => {
    const model = createTravelTimeModel();

    // Reference in US-015: OSRM gives 21.0 min at free flow from the Municipalidad, next
    // to this Plaza de Armas (20.9 min in the matrix), × 2.01 at 8:00.
    const trip = model.minutes(
      "la-molina-plaza-de-armas",
      "centro-empresarial-real",
      mondayAt("08:00"),
    );

    expect(trip.minutes).toBeCloseTo(42, 0);
    expect(trip.kind).toBe("dato");
  });

  it("has an OSRM time between every pair of places, so none falls back to an estimate", () => {
    const model = createTravelTimeModel();
    const { zones, meetingPoints, destinations } = limaPlaces;
    const ids = [...zones, ...meetingPoints, ...destinations].map(({ id }) => id);

    const estimated = ids.flatMap((from) =>
      ids
        .filter((to) => model.minutes(from, to, mondayAt("08:00")).kind === "estimado")
        .map((to) => `${from} → ${to}`),
    );

    expect(estimated).toEqual([]);
  });
});

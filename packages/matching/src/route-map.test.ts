import { describe, expect, it } from "vitest";

import { places, routeMapFor } from "./index";

// Short stand-ins for the OSRM shapes, so the expected paths can be written by hand.
const shapes = [
  {
    fromId: "san-borja",
    toId: "centro-empresarial-real",
    path: [
      [-12.10701, -76.99885],
      [-12.10078, -77.00165],
      [-12.09755, -77.03757],
    ] as [number, number][],
  },
  {
    fromId: "centro-empresarial-real",
    toId: "san-borja",
    path: [
      [-12.09755, -77.03757],
      [-12.10311, -77.00412],
      [-12.10701, -76.99885],
    ] as [number, number][],
  },
];

describe("the map of a trip (US-037)", () => {
  it("follows the street shape from San Borja to the sede, with my meeting point marked", () => {
    const map = routeMapFor(
      {
        direction: "outbound",
        originZoneId: "san-borja",
        destinationId: "centro-empresarial-real",
        stops: [{ meetingPointId: "san-borja-estacion-san-borja-sur", mine: true }],
      },
      { places, shapes },
    );

    expect(map).toEqual({
      path: [
        [-12.10701, -76.99885],
        [-12.10078, -77.00165],
        [-12.09755, -77.03757],
      ],
      approximate: false,
      markers: [
        { role: "start", name: "San Borja", lat: -12.107075, lng: -76.9988421, mine: false },
        {
          role: "meeting",
          name: "Estación San Borja Sur (Línea 1)",
          lat: -12.1004192,
          lng: -77.001846,
          mine: true,
        },
        {
          role: "end",
          name: "Centro Empresarial Real",
          lat: -12.0975459,
          lng: -77.0375707,
          mine: false,
        },
      ],
    });
  });

  it("takes the street shape from the sede back to San Borja on the way home", () => {
    const map = routeMapFor(
      {
        direction: "return",
        originZoneId: "san-borja",
        destinationId: "centro-empresarial-real",
        stops: [{ meetingPointId: "san-borja-municipalidad", mine: false }],
      },
      { places, shapes },
    );

    expect(map.path).toEqual([
      [-12.09755, -77.03757],
      [-12.10311, -77.00412],
      [-12.10701, -76.99885],
    ]);
    expect(map.approximate).toBe(false);
    expect(map.markers.map(({ role, name }) => [role, name])).toEqual([
      ["start", "Centro Empresarial Real"],
      ["meeting", "Municipalidad de San Borja"],
      ["end", "San Borja"],
    ]);
  });

  it("joins the points with straight lines, marked approximate, when the pair has no shape", () => {
    const map = routeMapFor(
      {
        direction: "outbound",
        originZoneId: "miraflores",
        destinationId: "centro-empresarial-real",
        stops: [{ meetingPointId: "miraflores-parque-kennedy", mine: true }],
      },
      { places, shapes },
    );

    expect(map.path).toEqual([
      [-12.1206214, -77.0294993],
      [-12.1217806, -77.0304221],
      [-12.0975459, -77.0375707],
    ]);
    expect(map.approximate).toBe(true);
  });

  it("goes straight to a stop in another zone, then by the streets of that zone to the sede", () => {
    const map = routeMapFor(
      {
        direction: "outbound",
        originZoneId: "miraflores",
        destinationId: "centro-empresarial-real",
        stops: [
          { meetingPointId: "miraflores-parque-kennedy", mine: false },
          { meetingPointId: "san-borja-estacion-san-borja-sur", mine: true },
        ],
      },
      { places, shapes },
    );

    expect(map.path).toEqual([
      [-12.1206214, -77.0294993],
      [-12.1217806, -77.0304221],
      [-12.1004192, -77.001846],
      [-12.10701, -76.99885],
      [-12.10078, -77.00165],
      [-12.09755, -77.03757],
    ]);
    expect(map.approximate).toBe(true);
  });

  it("leaves out a meeting point it does not know instead of failing the whole map", () => {
    const map = routeMapFor(
      {
        direction: "outbound",
        originZoneId: "san-borja",
        destinationId: "centro-empresarial-real",
        stops: [{ meetingPointId: "parque-que-ya-no-existe", mine: false }],
      },
      { places, shapes },
    );

    expect(map.markers.map(({ name }) => name)).toEqual(["San Borja", "Centro Empresarial Real"]);
    expect(map.approximate).toBe(false);
  });

  it("has the street shape of every zone of Lima to the sede and back", () => {
    const drawn = places.zones.flatMap((zone) =>
      (["outbound", "return"] as const).map(
        (direction) =>
          routeMapFor({
            direction,
            originZoneId: zone.id,
            destinationId: "centro-empresarial-real",
            stops: [],
          }).approximate,
      ),
    );

    expect(drawn).toHaveLength(50);
    expect(drawn.every((approximate) => !approximate)).toBe(true);
  });

  it("on the way home, goes by the streets to the first stop's zone, then straight on", () => {
    const map = routeMapFor(
      {
        direction: "return",
        originZoneId: "miraflores",
        destinationId: "centro-empresarial-real",
        stops: [
          { meetingPointId: "san-borja-estacion-san-borja-sur", mine: true },
          { meetingPointId: "miraflores-parque-kennedy", mine: false },
        ],
      },
      { places, shapes },
    );

    expect(map.path).toEqual([
      [-12.09755, -77.03757],
      [-12.10311, -77.00412],
      [-12.10701, -76.99885],
      [-12.1004192, -77.001846],
      [-12.1217806, -77.0304221],
      [-12.1206214, -77.0294993],
    ]);
    expect(map.approximate).toBe(true);
  });
});

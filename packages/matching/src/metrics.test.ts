import { describe, expect, it } from "vitest";

import { measureImpact } from "./index";

type Activity = Parameters<typeof measureImpact>[0];
type Offer = Activity["offers"][number];
type Seat = Offer["seats"][number];

// An accepted passenger who would have driven alone without this trip.
const seat = (overrides: Partial<Seat> = {}): Seat => ({
  status: "accepted",
  fallbackMode: "drive_alone",
  passengerIsTeam: false,
  datePassed: false,
  distanceKm: 10,
  detourKm: 0,
  ...overrides,
});

// A driver who used to drive alone, with the given passengers.
const offer = (seats: Seat[], overrides: Partial<Offer> = {}): Offer => ({
  driverUsualMode: "drove_alone",
  driverIsTeam: false,
  seats,
  ...overrides,
});

describe("impact of a community's shared trips", () => {
  it("counts 3 car trips avoided when 4 colleagues who drove alone share one car", () => {
    const metrics = measureImpact({ offers: [offer([seat(), seat(), seat()])], openNeeds: [] });

    expect(metrics.carTripsAvoided.potential.trips).toBe(3);
    expect(metrics.netCarTripsAvoided).toBe(3);
    expect(metrics.peopleTransported).toBe(3);
  });

  it("transports María, who would take the bus, without counting a car trip avoided", () => {
    const carlos = offer([seat({ fallbackMode: "public_transport" })]);

    const metrics = measureImpact({ offers: [carlos], openNeeds: [] });

    expect(metrics.peopleTransported).toBe(1);
    expect(metrics.carTripsAvoided.potential.trips).toBe(0);
    expect(metrics.fromPublicTransport).toBe(1);
  });

  it("counts an induced car trip when Ana, who rode the bus, starts driving two bus riders", () => {
    const ana = offer(
      [seat({ fallbackMode: "public_transport" }), seat({ fallbackMode: "public_transport" })],
      { driverUsualMode: "public_transport" },
    );

    const metrics = measureImpact({ offers: [ana], openNeeds: [] });

    expect(metrics.carTripsInduced).toBe(1);
    expect(metrics.netCarTripsAvoided).toBe(-1);
  });

  it("induces no car trip when a driver who came by taxi starts driving", () => {
    const metrics = measureImpact({
      offers: [offer([seat()], { driverUsualMode: "taxi_app" })],
      openNeeds: [],
    });

    expect(metrics.carTripsInduced).toBe(0);
    expect(metrics.netCarTripsAvoided).toBe(1);
  });

  it("counts the trip of a driver whose account was deleted as induced", () => {
    const metrics = measureImpact({
      offers: [offer([seat()], { driverUsualMode: null })],
      openNeeds: [],
    });

    expect(metrics.carTripsInduced).toBe(1);
    expect(metrics.netCarTripsAvoided).toBe(0);
  });

  it("induces no car trip for a driver nobody rides with", () => {
    const metrics = measureImpact({
      offers: [offer([], { driverUsualMode: "public_transport" })],
      openNeeds: [],
    });

    expect(metrics.carTripsInduced).toBe(0);
  });
});

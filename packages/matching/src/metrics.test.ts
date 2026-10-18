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

  it("counts 2 car trips avoided when 3 of 4 colleagues share a car: from 4 cars to 2", () => {
    // The fourth colleague keeps driving alone and is not on the platform.
    const metrics = measureImpact({ offers: [offer([seat(), seat()])], openNeeds: [] });

    expect(metrics.carTripsAvoided.potential.trips).toBe(2);
    expect(metrics.netCarTripsAvoided).toBe(2);
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

  it("leaves out passengers still waiting, turned down or cancelled", () => {
    const metrics = measureImpact({
      offers: [
        offer([
          seat({ status: "accepted" }),
          seat({ status: "pending" }),
          seat({ status: "rejected" }),
          seat({ status: "cancelled_by_passenger" }),
          seat({ status: "cancelled_by_driver" }),
        ]),
      ],
      openNeeds: [],
    });

    expect(metrics.peopleTransported).toBe(1);
    expect(metrics.carTripsAvoided.potential.trips).toBe(1);
  });

  it("verifies only the car trips avoided whose trip was completed", () => {
    const metrics = measureImpact({
      offers: [
        offer([
          seat({ status: "completed", datePassed: true }),
          seat({ status: "no_show", datePassed: true }),
          seat({ status: "accepted" }),
        ]),
      ],
      openNeeds: [],
    });

    expect(metrics.peopleTransported).toBe(3);
    expect(metrics.carTripsAvoided.potential.trips).toBe(3);
    expect(metrics.carTripsAvoided.verified.trips).toBe(1);
  });

  it("estimates the km avoided as each avoided trip's distance minus every passenger's detour", () => {
    const metrics = measureImpact({
      offers: [
        offer([
          seat({ distanceKm: 25, detourKm: 2 }),
          seat({ distanceKm: 15, detourKm: 0 }),
          // Picking up a bus rider takes no car off the road, but the detour is still driven.
          seat({ fallbackMode: "public_transport", distanceKm: 30, detourKm: 3 }),
        ]),
      ],
      openNeeds: [],
    });

    // 25 + 15 km not driven, minus 2 + 0 + 3 km of detours.
    expect(metrics.carTripsAvoided.potential.km).toBeCloseTo(35);
  });

  it("estimates the CO₂ of 35 km avoided as one gallon of gasoline, 8.887 kg (EPA)", () => {
    const metrics = measureImpact({
      offers: [offer([seat({ distanceKm: 35, detourKm: 0 })])],
      openNeeds: [],
    });

    expect(metrics.carTripsAvoided.potential.co2Kg).toBeCloseTo(8.887, 3);
  });

  it("verifies the km and CO₂ avoided only on completed trips", () => {
    const metrics = measureImpact({
      offers: [
        offer([
          seat({ status: "completed", datePassed: true, distanceKm: 25, detourKm: 2 }),
          seat({
            status: "completed",
            datePassed: true,
            fallbackMode: "public_transport",
            detourKm: 3,
          }),
          seat({ status: "accepted", distanceKm: 15, detourKm: 0 }),
        ]),
      ],
      openNeeds: [],
    });

    // 25 km not driven, minus 2 + 3 km of detours: 20 km, or 4/7 of a gallon.
    expect(metrics.carTripsAvoided.verified.km).toBeCloseTo(20);
    expect(metrics.carTripsAvoided.verified.co2Kg).toBeCloseTo(5.078, 3);
  });

  it("subtracts from the verified km the detour driven for a passenger who did not show up", () => {
    const metrics = measureImpact({
      offers: [
        offer([
          seat({ status: "completed", datePassed: true, distanceKm: 25, detourKm: 0 }),
          seat({ status: "no_show", datePassed: true, distanceKm: 30, detourKm: 4 }),
        ]),
      ],
      openNeeds: [],
    });

    expect(metrics.carTripsAvoided.verified.trips).toBe(1);
    expect(metrics.carTripsAvoided.verified.km).toBeCloseTo(21);
  });

  it("reports negative km and CO₂ when the detours outweigh the car trips avoided", () => {
    const metrics = measureImpact({
      offers: [offer([seat({ fallbackMode: "public_transport", detourKm: 3.5 })])],
      openNeeds: [],
    });

    // 3.5 km of detour is a tenth of a gallon: 0.8887 kg of CO₂ more, not less.
    expect(metrics.carTripsAvoided.potential.km).toBeCloseTo(-3.5);
    expect(metrics.carTripsAvoided.potential.co2Kg).toBeCloseTo(-0.8887, 4);
  });

  it("averages 2 passengers over 3 trips with 1, 2 and 3, leaving out a trip nobody took", () => {
    const metrics = measureImpact({
      offers: [
        offer([seat()]),
        offer([seat(), seat()]),
        offer([seat(), seat(), seat()]),
        offer([]),
      ],
      openNeeds: [],
    });

    expect(metrics.averagePassengers).toBe(2);
  });

  it("covers 3 of 4 open needs when 3 have a compatible offer, leaving out the team's", () => {
    const need = (hasCompatibleOffer: boolean, passengerIsTeam = false) => ({
      hasCompatibleOffer,
      passengerIsTeam,
    });

    const metrics = measureImpact({
      offers: [],
      openNeeds: [need(true), need(true), need(true), need(false), need(false, true)],
    });

    expect(metrics.coverage).toBe(0.75);
  });

  it("fulfils 2 of the 4 accepted trips whose date passed, not counting one still ahead", () => {
    const metrics = measureImpact({
      offers: [
        offer([
          seat({ status: "completed", datePassed: true }),
          seat({ status: "completed", datePassed: true }),
          seat({ status: "no_show", datePassed: true }),
          seat({ status: "accepted", datePassed: true }),
          seat({ status: "accepted", datePassed: false }),
        ]),
      ],
      openNeeds: [],
    });

    expect(metrics.fulfilment).toBe(0.5);
  });

  it("counts a trip completed earlier today as fulfilled", () => {
    const metrics = measureImpact({
      offers: [offer([seat({ status: "completed", datePassed: false })])],
      openNeeds: [],
    });

    expect(metrics.fulfilment).toBe(1);
  });

  it("gives no ratio, rather than a made-up one, for a community with no activity yet", () => {
    const metrics = measureImpact({ offers: [], openNeeds: [] });

    expect(metrics.peopleTransported).toBe(0);
    expect(metrics.coverage).toBeNull();
    expect(metrics.fulfilment).toBeNull();
    expect(metrics.averagePassengers).toBeNull();
  });

  it("leaves out every trip with a team account on either side", () => {
    const metrics = measureImpact({
      offers: [
        offer([seat(), seat({ passengerIsTeam: true })]),
        offer([seat()], { driverIsTeam: true, driverUsualMode: "public_transport" }),
      ],
      openNeeds: [],
    });

    expect(metrics.peopleTransported).toBe(1);
    expect(metrics.carTripsAvoided.potential.trips).toBe(1);
    expect(metrics.carTripsInduced).toBe(0);
  });

  it("induces no car trip for a driver whose passengers are not accepted yet", () => {
    const metrics = measureImpact({
      offers: [offer([seat({ status: "pending" })], { driverUsualMode: "public_transport" })],
      openNeeds: [],
    });

    expect(metrics.carTripsInduced).toBe(0);
  });
});

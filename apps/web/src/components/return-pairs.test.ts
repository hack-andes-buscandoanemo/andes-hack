import { describe, expect, it } from "vitest";

import type { MyTrip } from "@/lib/communities-api";

import { pairReturns } from "./return-pairs";

const COMMUNITY_ID = "33333333-3333-4333-8333-333333333333";

const trip = (overrides: Partial<MyTrip> & { id: string }): MyTrip => ({
  offerId: `offer-${overrides.id}`,
  role: "passenger",
  status: "accepted",
  progress: null,
  direction: "outbound",
  date: null,
  daysOfWeek: [1, 3],
  time: "07:00",
  originZoneName: "La Molina",
  destinationName: "Centro Empresarial Real",
  meetingPointName: null,
  driver: null,
  seatsTotal: null,
  seatsFree: null,
  pendingRequests: null,
  acceptedPassengers: null,
  fuelEstimate: null,
  passengerRequest: {
    communityId: COMMUNITY_ID,
    originZoneId: "san-borja",
    date: null,
    daysOfWeek: [1, 3],
    fallbackMode: "public_transport",
    returnWindow: null,
  },
  ...overrides,
});

const OUT = trip({ id: "out" });

describe("pairReturns", () => {
  it("pairs an accepted outbound with the accepted return that shares its days", () => {
    const back = trip({ id: "back", direction: "return", time: "18:00" });
    const paired = pairReturns([OUT, back]);
    expect(paired.get("out")).toEqual([{ trip: back, label: "Lunes y miércoles" }]);
    expect(paired.get("back")).toBeUndefined();
  });

  it("does not pair a return from another zone or community", () => {
    const base = { direction: "return" as const, time: "18:00" };
    const otherZone = trip({
      ...base,
      id: "zone",
      passengerRequest: { ...OUT.passengerRequest!, originZoneId: "la-molina" },
    });
    const otherCommunity = trip({
      ...base,
      id: "community",
      passengerRequest: {
        ...OUT.passengerRequest!,
        communityId: "44444444-4444-4444-8444-444444444444",
      },
    });
    expect(pairReturns([OUT, otherZone, otherCommunity]).get("out")).toBeUndefined();
  });

  it("does not pair a return that is not accepted or shares no day", () => {
    const base = { direction: "return" as const, time: "18:00" };
    const pending = trip({ ...base, id: "pending", status: "pending" });
    const otherDays = trip({
      ...base,
      id: "days",
      daysOfWeek: [2, 4],
      passengerRequest: { ...OUT.passengerRequest!, daysOfWeek: [2, 4] },
    });
    expect(pairReturns([OUT, pending, otherDays]).get("out")).toBeUndefined();
  });

  it("only pairs a return that leaves later the same day (HH:mm text comparison, no overnight trips)", () => {
    const earlier = trip({ id: "earlier", direction: "return", time: "06:30" });
    const same = trip({ id: "same", direction: "return", time: "07:00" });
    const night = trip({ id: "night", direction: "return", time: "00:30" });
    expect(pairReturns([OUT, earlier, same, night]).get("out")).toBeUndefined();
  });
});

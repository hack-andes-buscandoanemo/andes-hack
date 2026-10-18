import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    BETTER_AUTH_SECRET: "vitest-secret-with-at-least-thirty-two-characters",
    BETTER_AUTH_URL: "http://localhost:3000",
    UPSTASH_REDIS_REST_URL: "https://example.com",
    UPSTASH_REDIS_REST_TOKEN: "vitest-token",
    CORS_ORIGIN: "http://localhost:3001",
    TEAM_EMAILS: "equipo@tejalo.pe",
    NODE_ENV: "test",
  });
});

import { user } from "@andes-hack/db/schema/auth";
import { community, communityMember } from "@andes-hack/db/schema/community";
import { meetingPoint, zone } from "@andes-hack/db/schema/places";
import { seatBooking, tripOffer, tripRequest } from "@andes-hack/db/schema/trips";
import { vehicle } from "@andes-hack/db/schema/vehicle";
import { createTestDb } from "@andes-hack/db/test-db";
import { eq } from "drizzle-orm";

import { createApp } from "./index";

let testDb: Awaited<ReturnType<typeof createTestDb>>["db"];
let closeDb: () => Promise<void>;

beforeAll(async () => {
  const instance = await createTestDb();
  testDb = instance.db;
  closeDb = instance.close;
});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await testDb.delete(seatBooking);
  await testDb.delete(tripRequest);
  await testDb.delete(tripOffer);
  await testDb.delete(vehicle);
  await testDb.delete(meetingPoint);
  await testDb.delete(communityMember);
  await testDb.delete(community);
  await testDb.delete(zone);
  await testDb.delete(user);
});

const FUTURE_DATE = "2099-03-02";
const PAST_DATE = "2020-03-02";

async function seedWorld() {
  const [org] = await testDb
    .insert(community)
    .values({
      slug: "alfa",
      name: "Comunidad Alfa",
      kind: "company",
      destinationName: "Centro Empresarial Real",
      destinationLat: -12.0975459,
      destinationLng: -77.0375707,
      isDemo: true,
    })
    .returning();
  await testDb.insert(zone).values([
    { id: "la-molina", name: "La Molina", district: "La Molina", lat: -12.0853, lng: -76.9682 },
    { id: "san-borja", name: "San Borja", district: "San Borja", lat: -12.0897, lng: -77.0031 },
  ]);
  await testDb.insert(meetingPoint).values({
    id: "san-borja-estacion-san-borja-sur",
    zoneId: "san-borja",
    name: "Estación San Borja Sur (Línea 1)",
    kind: "rail_station",
    lat: -12.1004192,
    lng: -77.001846,
    source: "test",
  });
  return org!;
}

async function createMember(communityId: string, id: string, name: string, alias?: string) {
  const [person] = await testDb
    .insert(user)
    .values({ id, name, email: `${id}@alfa.pe` })
    .returning();
  await testDb.insert(communityMember).values({
    communityId,
    userId: id,
    verificationMethod: "join_code",
    consentVersion: "v1",
    consentAt: new Date("2026-10-18T12:00:00.000Z"),
    usualMode: "drove_alone",
    travelRole: "both",
    alias: alias ?? null,
  });
  return person!;
}

async function createOffer(
  communityId: string,
  driverId: string,
  options: { date?: string; status?: "active" | "paused" | "cancelled" } = {},
) {
  const [car] = await testDb
    .insert(vehicle)
    .values({
      ownerId: driverId,
      plate: `P${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      make: "Toyota",
      model: "Corolla",
      color: "Gris",
      seats: 4,
    })
    .returning();
  const [offer] = await testDb
    .insert(tripOffer)
    .values({
      communityId,
      driverId,
      vehicleId: car!.id,
      direction: "outbound",
      originZoneId: "la-molina",
      departureTime: "07:00",
      ...(options.date ? { date: options.date } : { daysOfWeek: [1, 2, 3, 4, 5] }),
      seatsTotal: 3,
      maxDetourMinutes: 10,
      status: options.status ?? "active",
    })
    .returning();
  return { offer: offer!, plate: car!.plate };
}

async function book(
  offer: { id: string; communityId: string },
  passengerId: string,
  status: "pending" | "accepted" | "rejected" | "cancelled_by_passenger" | "completed" | "no_show",
) {
  const [need] = await testDb
    .insert(tripRequest)
    .values({
      communityId: offer.communityId,
      passengerId,
      direction: "outbound",
      originZoneId: "san-borja",
      windowStart: "07:30",
      windowEnd: "08:00",
      daysOfWeek: [1, 2, 3],
      maxWalkMinutes: 15,
      fallbackMode: "taxi_app",
      status: "matched",
    })
    .returning();
  const [booking] = await testDb
    .insert(seatBooking)
    .values({
      offerId: offer.id,
      requestId: need!.id,
      passengerId,
      meetingPointId: "san-borja-estacion-san-borja-sur",
      pickupAt: "07:29",
      detourMinutes: 6,
      walkMinutes: 4,
      status,
    })
    .returning();
  return booking!;
}

type TripsBody = {
  trips: Array<{ status: string; date: string | null; driver: unknown } & Record<string, unknown>>;
};

function requestAs(person: { id: string }, path: string) {
  const app = createApp({
    db: testDb as never,
    getSession: async () => ({ user: person }) as never,
    rateLimit: async () => ({ success: true, reset: 0 }),
  });
  return app.request(path) as unknown as Promise<{
    status: number;
    json(): Promise<TripsBody>;
  }>;
}

describe("GET /me/trips", () => {
  it("shows an accepted trip to the passenger with the driver's alias and plate", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver-1", "Carlos Quispe", "Carlos Q.");
    const passenger = await createMember(org.id, "pax-1", "Lucía Ramos");
    const { offer, plate } = await createOffer(org.id, driver.id);
    const booking = await book(offer, passenger.id, "accepted");

    const response = await requestAs(passenger, "/me/trips?role=passenger&scope=upcoming");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      trips: [
        {
          id: booking.id,
          offerId: offer.id,
          role: "passenger",
          status: "accepted",
          direction: "outbound",
          date: null,
          daysOfWeek: [1, 2, 3, 4, 5],
          time: "07:29:00",
          originZoneName: "La Molina",
          destinationName: "Centro Empresarial Real",
          meetingPointName: "Estación San Borja Sur (Línea 1)",
          driver: { alias: "Carlos Q.", plate },
          seatsTotal: null,
          seatsFree: null,
          pendingRequests: null,
          acceptedPassengers: null,
          // La Molina → Centro Empresarial Real, 15.77 km: S/ 10,04 between Carlos and Lucía.
          fuelEstimate: { tripSoles: 10.04, perOccupantSoles: 5.02, occupants: 2 },
        },
      ],
    });
  });
  it("counts a passenger still waiting as one more occupant than those already aboard", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver-1", "Carlos Quispe", "Carlos Q.");
    const aboard = await createMember(org.id, "pax-1", "Lucía Ramos");
    const waiting = await createMember(org.id, "pax-2", "Mario Soto");
    const { offer } = await createOffer(org.id, driver.id);
    await book(offer, aboard.id, "accepted");
    await book(offer, waiting.id, "pending");

    const body = await (await requestAs(waiting, "/me/trips?role=passenger&scope=upcoming")).json();

    expect(body.trips.map((trip) => trip.fuelEstimate)).toEqual([
      { tripSoles: 10.04, perOccupantSoles: 3.34, occupants: 3 },
    ]);
  });
  it("hides the driver's alias and plate while the request is not accepted", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver-1", "Carlos Quispe", "Carlos Q.");
    const passenger = await createMember(org.id, "pax-1", "Lucía Ramos");
    const { offer } = await createOffer(org.id, driver.id);
    await book(offer, passenger.id, "pending");

    const body = await (
      await requestAs(passenger, "/me/trips?role=passenger&scope=upcoming")
    ).json();

    expect(body.trips).toHaveLength(1);
    expect(body.trips[0]).toMatchObject({ status: "pending", driver: null });
    expect(JSON.stringify(body)).not.toContain("Carlos");
  });
  it("moves closed requests to the past scope with their derived status", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver-1", "Carlos Quispe", "Carlos Q.");
    const passenger = await createMember(org.id, "pax-1", "Lucía Ramos");
    const { offer } = await createOffer(org.id, driver.id);
    await book(offer, passenger.id, "rejected");
    await book(offer, passenger.id, "cancelled_by_passenger");
    await book(offer, passenger.id, "completed");
    await book(offer, passenger.id, "no_show");
    await book(offer, passenger.id, "pending");

    const past = await (await requestAs(passenger, "/me/trips?role=passenger&scope=past")).json();
    const upcoming = await (
      await requestAs(passenger, "/me/trips?role=passenger&scope=upcoming")
    ).json();

    expect(past.trips.map((trip: { status: string }) => trip.status).sort()).toEqual([
      "cancelled",
      "completed",
      "no_show",
      "rejected",
    ]);
    expect(upcoming.trips.map((trip: { status: string }) => trip.status)).toEqual(["pending"]);
  });
  it("splits one-off trips by their date in Lima time", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver-1", "Carlos Quispe", "Carlos Q.");
    const passenger = await createMember(org.id, "pax-1", "Lucía Ramos");
    const ahead = await createOffer(org.id, driver.id, { date: FUTURE_DATE });
    const behind = await createOffer(org.id, driver.id, { date: PAST_DATE });
    await book(ahead.offer, passenger.id, "accepted");
    await book(behind.offer, passenger.id, "accepted");

    const dates = async (scope: string) =>
      (
        await (await requestAs(passenger, `/me/trips?role=passenger&scope=${scope}`)).json()
      ).trips.map((trip) => trip.date);

    expect(await dates("upcoming")).toEqual([FUTURE_DATE]);
    expect(await dates("past")).toEqual([PAST_DATE]);
  });

  it("shows an accepted request on a cancelled trip as cancelled without the plate", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver-1", "Carlos Quispe", "Carlos Q.");
    const passenger = await createMember(org.id, "pax-1", "Lucía Ramos");
    const { offer, plate } = await createOffer(org.id, driver.id, { status: "cancelled" });
    await book(offer, passenger.id, "accepted");

    const body = await (await requestAs(passenger, "/me/trips?role=passenger&scope=past")).json();

    expect(body.trips).toHaveLength(1);
    expect(body.trips[0]).toMatchObject({ status: "cancelled", driver: null });
    expect(JSON.stringify(body)).not.toContain(plate);
  });
  it("never lists the trips of other people", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver-1", "Carlos Quispe", "Carlos Q.");
    const passenger = await createMember(org.id, "pax-1", "Lucía Ramos");
    const stranger = await createMember(org.id, "pax-2", "Mario Soto");
    const { offer } = await createOffer(org.id, driver.id);
    await book(offer, passenger.id, "accepted");

    const asStranger = await (
      await requestAs(stranger, "/me/trips?role=passenger&scope=upcoming")
    ).json();
    const strangerAsDriver = await (
      await requestAs(stranger, "/me/trips?role=driver&scope=upcoming")
    ).json();

    expect(asStranger).toEqual({ trips: [] });
    expect(strangerAsDriver).toEqual({ trips: [] });
  });

  it("rejects an unknown role or scope with a validation error", async () => {
    const org = await seedWorld();
    const passenger = await createMember(org.id, "pax-1", "Lucía Ramos");

    const badRole = await requestAs(passenger, "/me/trips?role=admin&scope=upcoming");
    const badScope = await requestAs(passenger, "/me/trips?role=passenger&scope=soon");

    expect(badRole.status).toBe(422);
    expect(badScope.status).toBe(422);
  });
  it("lists the driver's offers with pending requests and accepted passengers only", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver-1", "Carlos Quispe", "Carlos Q.");
    const accepted = await createMember(org.id, "pax-1", "Lucía Ramos", "Lucía R.");
    const waiting = await createMember(org.id, "pax-2", "Mario Soto", "Mario S.");
    const { offer } = await createOffer(org.id, driver.id);
    await book(offer, accepted.id, "accepted");
    await book(offer, waiting.id, "pending");

    const response = await requestAs(driver, "/me/trips?role=driver&scope=upcoming");
    const body = await response.json();

    expect(body).toEqual({
      trips: [
        {
          id: offer.id,
          offerId: offer.id,
          role: "driver",
          status: "active",
          direction: "outbound",
          date: null,
          daysOfWeek: [1, 2, 3, 4, 5],
          time: "07:00:00",
          originZoneName: "La Molina",
          destinationName: "Centro Empresarial Real",
          meetingPointName: null,
          driver: null,
          seatsTotal: 3,
          seatsFree: 2,
          pendingRequests: 1,
          acceptedPassengers: ["Lucía R."],
          // Carlos and Lucía share the leg; Mario is not aboard until accepted.
          fuelEstimate: { tripSoles: 10.04, perOccupantSoles: 5.02, occupants: 2 },
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("Mario");
  });
  it("keeps paused offers upcoming and moves cancelled or finished ones to the past", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver-1", "Carlos Quispe", "Carlos Q.");
    await createOffer(org.id, driver.id, { status: "paused" });
    await createOffer(org.id, driver.id, { status: "cancelled" });
    await createOffer(org.id, driver.id, { date: PAST_DATE });

    const statuses = async (scope: string) =>
      (await (await requestAs(driver, `/me/trips?role=driver&scope=${scope}`)).json()).trips
        .map((trip) => trip.status)
        .sort();

    expect(await statuses("upcoming")).toEqual(["paused"]);
    expect(await statuses("past")).toEqual(["cancelled", "completed"]);
  });

  it("reveals no passengers on a cancelled offer", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver-1", "Carlos Quispe", "Carlos Q.");
    const accepted = await createMember(org.id, "pax-1", "Lucía Ramos", "Lucía R.");
    const waiting = await createMember(org.id, "pax-2", "Mario Soto", "Mario S.");
    const { offer } = await createOffer(org.id, driver.id, { status: "cancelled" });
    await book(offer, accepted.id, "accepted");
    await book(offer, waiting.id, "pending");

    const body = await (await requestAs(driver, "/me/trips?role=driver&scope=past")).json();

    expect(body.trips[0]).toMatchObject({
      status: "cancelled",
      pendingRequests: 0,
      acceptedPassengers: [],
    });
    expect(JSON.stringify(body)).not.toContain("Lucía");
  });

  it("keeps the passenger's trip when the driver left the community", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver-1", "Carlos Quispe", "Carlos Q.");
    const passenger = await createMember(org.id, "pax-1", "Lucía Ramos");
    const { offer } = await createOffer(org.id, driver.id);
    await book(offer, passenger.id, "accepted");
    await testDb.delete(communityMember).where(eq(communityMember.userId, driver.id));

    const body = await (
      await requestAs(passenger, "/me/trips?role=passenger&scope=upcoming")
    ).json();

    expect(body.trips).toHaveLength(1);
    expect(body.trips[0]).toMatchObject({ driver: { alias: "Carlos Quispe" } });
  });

  it("keeps a weekly trip upcoming while the offer is paused and the request is open", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver-1", "Carlos Quispe", "Carlos Q.");
    const passenger = await createMember(org.id, "pax-1", "Lucía Ramos");
    const { offer } = await createOffer(org.id, driver.id, { status: "paused" });
    await book(offer, passenger.id, "accepted");
    await book(offer, passenger.id, "rejected");

    const statuses = async (scope: string) =>
      (await (await requestAs(passenger, `/me/trips?role=passenger&scope=${scope}`)).json()).trips
        .map((trip) => trip.status)
        .sort();

    expect(await statuses("upcoming")).toEqual(["accepted"]);
    expect(await statuses("past")).toEqual(["rejected"]);
  });

  it("shows a request nobody answered before a one-off trip left as cancelled in the past", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver-1", "Carlos Quispe", "Carlos Q.");
    const passenger = await createMember(org.id, "pax-1", "Lucía Ramos");
    const { offer } = await createOffer(org.id, driver.id, { date: PAST_DATE });
    await book(offer, passenger.id, "pending");

    const past = await (await requestAs(passenger, "/me/trips?role=passenger&scope=past")).json();
    const upcoming = await (
      await requestAs(passenger, "/me/trips?role=passenger&scope=upcoming")
    ).json();

    expect(past.trips.map((trip) => trip.status)).toEqual(["cancelled"]);
    expect(upcoming.trips).toEqual([]);
  });
});

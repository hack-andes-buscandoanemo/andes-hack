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

type FallbackMode = "drive_alone" | "taxi_app" | "public_transport" | "picked_up" | "other";
type BookingStatus = "pending" | "accepted" | "rejected" | "completed";

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

async function createMember(communityId: string, id: string, name: string) {
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
  });
  return person!;
}

async function createOffer(communityId: string, driverId: string) {
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
      date: "2026-10-12",
      seatsTotal: 3,
      maxDetourMinutes: 10,
      status: "active",
    })
    .returning();
  return offer!;
}

async function ride(
  offer: { id: string; communityId: string },
  passengerId: string,
  fallbackMode: FallbackMode,
  status: BookingStatus = "accepted",
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
      date: "2026-10-12",
      maxWalkMinutes: 15,
      fallbackMode,
      status: "matched",
    })
    .returning();
  await testDb.insert(seatBooking).values({
    offerId: offer.id,
    requestId: need!.id,
    passengerId,
    meetingPointId: "san-borja-estacion-san-borja-sur",
    pickupAt: "07:29",
    detourMinutes: 6,
    walkMinutes: 4,
    status,
  });
}

type ImpactBody = {
  sharedTrips: number;
  carTripsAvoided: number;
  co2Kg: number;
  fromPublicTransport: number;
};

async function myImpact(person: { id: string }, communityId: string) {
  const app = createApp({
    db: testDb as never,
    getSession: async () => ({ user: person }) as never,
    rateLimit: async () => ({ success: true, reset: 0 }),
    now: () => new Date("2026-10-18T15:00:00.000Z"),
  });
  const response = await app.request(`/communities/${communityId}/me/impact`);
  return { status: response.status, body: (await response.json()) as ImpactBody };
}

describe("GET /communities/{id}/me/impact", () => {
  it("counts three shared trips and three car trips avoided for a passenger who would have driven", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver-1", "Carlos Quispe");
    const ana = await createMember(org.id, "pax-ana", "Ana Torres");
    for (let trip = 0; trip < 3; trip += 1) {
      await ride(await createOffer(org.id, driver.id), ana.id, "drive_alone");
    }

    const { status, body } = await myImpact(ana, org.id);

    expect(status).toBe(200);
    expect(body).toMatchObject({ sharedTrips: 3, carTripsAvoided: 3, fromPublicTransport: 0 });
    expect(body.co2Kg).toBeGreaterThan(0);
  });

  it("counts no car trip avoided and no CO₂ for a passenger who would have gone by bus", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver-1", "Carlos Quispe");
    const rosa = await createMember(org.id, "pax-rosa", "Rosa Huamán");
    for (let trip = 0; trip < 3; trip += 1) {
      await ride(await createOffer(org.id, driver.id), rosa.id, "public_transport");
    }

    const { body } = await myImpact(rosa, org.id);

    expect(body).toEqual({
      sharedTrips: 3,
      carTripsAvoided: 0,
      co2Kg: 0,
      fromPublicTransport: 3,
    });
  });

  it("counts a driver's trip with passengers as shared, leaving the car trips avoided to them", async () => {
    const org = await seedWorld();
    const carlos = await createMember(org.id, "driver-1", "Carlos Quispe");
    const ana = await createMember(org.id, "pax-ana", "Ana Torres");
    const luis = await createMember(org.id, "pax-luis", "Luis Paredes");
    const full = await createOffer(org.id, carlos.id);
    await ride(full, ana.id, "drive_alone");
    await ride(full, luis.id, "taxi_app");
    await ride(await createOffer(org.id, carlos.id), ana.id, "drive_alone", "pending");

    const { body } = await myImpact(carlos, org.id);

    expect(body).toEqual({
      sharedTrips: 1,
      carTripsAvoided: 0,
      co2Kg: 0,
      fromPublicTransport: 0,
    });
  });

  it("counts a ride with a team driver on the passenger's own profile", async () => {
    const org = await seedWorld();
    const team = await createMember(org.id, "driver-team", "Equipo Te Jalo");
    const ana = await createMember(org.id, "pax-ana", "Ana Torres");
    const offer = await createOffer(org.id, team.id);
    await testDb.update(tripOffer).set({ driverWasTeam: true }).where(eq(tripOffer.id, offer.id));
    await ride(offer, ana.id, "drive_alone");

    const { body } = await myImpact(ana, org.id);

    expect(body).toMatchObject({ sharedTrips: 1, carTripsAvoided: 1 });
  });
});

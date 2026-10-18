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

async function createCommunity(slug: string) {
  const [row] = await testDb
    .insert(community)
    .values({
      slug,
      name: "Comunidad Alfa",
      kind: "company",
      destinationName: "Centro Empresarial Real",
      destinationLat: -12.0975459,
      destinationLng: -77.0375707,
    })
    .returning();
  return row!;
}

async function createMember(
  communityId: string,
  id: string,
  name: string,
  options: { alias?: string; isTeam?: boolean } = {},
) {
  const email = `${id}@alfa.pe`;
  await testDb.insert(user).values({ id, name, email, emailVerified: true }).onConflictDoNothing();
  const [member] = await testDb
    .insert(communityMember)
    .values({
      communityId,
      userId: id,
      alias: options.alias ?? name,
      isTeam: options.isTeam ?? false,
      role: "member",
      verificationMethod: "join_code",
      consentVersion: "v1",
      consentAt: new Date("2026-10-18T12:00:00.000Z"),
      usualMode: "drove_alone",
      travelRole: "both",
    })
    .returning();
  return { id, name, email, member: member! };
}

async function seedOffer(
  communityId: string,
  driverId: string,
  departureTime = "07:30",
  seatsTotal = 3,
) {
  const [car] = await testDb
    .insert(vehicle)
    .values({
      ownerId: driverId,
      plate: `ABC${Math.floor(100 + Math.random() * 900)}`,
      make: "Toyota",
      model: "Yaris",
      color: "Azul",
      seats: 4,
    })
    .returning();
  await testDb
    .insert(zone)
    .values({
      id: "san-borja",
      name: "San Borja",
      district: "San Borja",
      lat: -12.0897,
      lng: -77.0031,
    })
    .onConflictDoNothing();
  const [offer] = await testDb
    .insert(tripOffer)
    .values({
      communityId,
      driverId,
      vehicleId: car!.id,
      direction: "outbound",
      originZoneId: "san-borja",
      departureTime,
      date: "2026-10-19",
      seatsTotal,
      seatsTaken: 0,
      maxDetourMinutes: 10,
    })
    .returning();
  return offer!;
}

describe("POST /offers/{id}/cancel (US-022)", () => {
  it("cancels the offer, marks bookings as cancelled_by_driver, reopens passenger needs, and returns alternatives", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driverMateo = await createMember(alfa.id, "u-mateo", "Mateo");
    const driverCarlos = await createMember(alfa.id, "u-carlos", "Carlos");
    const passengerLucia = await createMember(alfa.id, "u-lucia", "Lucía");

    // Mateo's offer (which will be cancelled)
    const mateoOffer = await seedOffer(alfa.id, driverMateo.id, "07:30");
    // Carlos's alternative compatible offer
    const carlosOffer = await seedOffer(alfa.id, driverCarlos.id, "07:35");

    // Lucia's trip request / need
    const [luciaNeed] = await testDb
      .insert(tripRequest)
      .values({
        communityId: alfa.id,
        passengerId: passengerLucia.id,
        direction: "outbound",
        originZoneId: "san-borja",
        windowStart: "07:00",
        windowEnd: "08:00",
        date: "2026-10-19",
        maxWalkMinutes: 15,
        fallbackMode: "drive_alone",
        status: "matched",
      })
      .returning();

    await testDb
      .insert(meetingPoint)
      .values({
        id: "san-borja-estacion-san-borja-sur",
        zoneId: "san-borja",
        name: "Estación San Borja Sur (Línea 1)",
        kind: "rail_station",
        lat: -12.1082,
        lng: -77.0016,
        source: "places",
      })
      .onConflictDoNothing();

    // Lucia has an accepted booking on Mateo's offer
    const [booking] = await testDb
      .insert(seatBooking)
      .values({
        offerId: mateoOffer.id,
        requestId: luciaNeed!.id,
        passengerId: passengerLucia.id,
        meetingPointId: "san-borja-estacion-san-borja-sur",
        pickupAt: "07:29",
        detourMinutes: 6,
        walkMinutes: 5,
        status: "accepted",
      })
      .returning();

    await testDb.update(tripOffer).set({ seatsTaken: 1 }).where(eq(tripOffer.id, mateoOffer.id));

    const appAsMateo = createApp({
      db: testDb as never,
      getSession: (async () => ({
        user: { id: driverMateo.id, email: driverMateo.email },
        session: {},
      })) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
      now: () => new Date("2026-10-19T06:00:00-05:00"), // 90 min before departure (not late)
    });

    const res = await appAsMateo.request(`/offers/${mateoOffer.id}/cancel`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      offer: { id: string; status: string };
      lateCancelled: boolean;
      affectedBookings: Array<{ bookingId: string; status: string }>;
    };
    expect(body.offer.status).toBe("cancelled");
    expect(body.lateCancelled).toBe(false);
    expect(body.affectedBookings).toEqual([
      { bookingId: booking!.id, passengerId: passengerLucia.id, status: "cancelled_by_driver" },
    ]);

    // Verify Lucia's request is reopened (status = 'open')
    const [updatedNeed] = await testDb
      .select({ status: tripRequest.status })
      .from(tripRequest)
      .where(eq(tripRequest.id, luciaNeed!.id));
    expect(updatedNeed?.status).toBe("open");

    // Verify Lucia sees the cancellation and recalculated alternatives (Carlos's offer, without Mateo's)
    const appAsLucia = createApp({
      db: testDb as never,
      getSession: (async () => ({
        user: { id: passengerLucia.id, email: passengerLucia.email },
        session: {},
      })) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
    });

    const detailRes = await appAsLucia.request(`/offers/${mateoOffer.id}`);
    expect(detailRes.status).toBe(200);
    const detailBody = (await detailRes.json()) as {
      status: string;
      booking: { status: string };
      alternatives?: Array<{ offerId: string }>;
    };
    expect(detailBody.status).toBe("cancelled");
    expect(detailBody.booking.status).toBe("cancelled_by_driver");
    expect(detailBody.alternatives).toBeDefined();
    expect(detailBody.alternatives?.some((alt) => alt.offerId === carlosOffer.id)).toBe(true);
    expect(detailBody.alternatives?.some((alt) => alt.offerId === mateoOffer.id)).toBe(false);
  });

  it("answers 403 when someone who is not the driver tries to cancel the offer", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const stranger = await createMember(alfa.id, "u-stranger", "Extraño");
    const offer = await seedOffer(alfa.id, driver.id);

    const app = createApp({
      db: testDb as never,
      getSession: (async () => ({
        user: { id: stranger.id, email: stranger.email },
        session: {},
      })) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
    });

    const res = await app.request(`/offers/${offer.id}/cancel`, { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("is idempotent when cancelled twice", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const offer = await seedOffer(alfa.id, driver.id);

    const app = createApp({
      db: testDb as never,
      getSession: (async () => ({
        user: { id: driver.id, email: driver.email },
        session: {},
      })) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
      now: () => new Date("2026-10-19T05:00:00-05:00"),
    });

    const first = await app.request(`/offers/${offer.id}/cancel`, { method: "POST" });
    expect(first.status).toBe(200);

    const second = await app.request(`/offers/${offer.id}/cancel`, { method: "POST" });
    expect(second.status).toBe(200);
    const body = (await second.json()) as { offer: { status: string } };
    expect(body.offer.status).toBe("cancelled");
  });

  it("marks driver cancellation with less than 60 minutes notice (US-022)", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    // Departure at 07:00
    const offer = await seedOffer(alfa.id, driver.id, "07:00");

    // 06:50 in America/Lima (10 minutes before departure)
    const app = createApp({
      db: testDb as never,
      getSession: (async () => ({
        user: { id: driver.id, email: driver.email },
        session: {},
      })) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
      now: () => new Date("2026-10-19T06:50:00-05:00"),
    });

    const res = await app.request(`/offers/${offer.id}/cancel`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lateCancelled: boolean };
    expect(body.lateCancelled).toBe(true);
  });
});

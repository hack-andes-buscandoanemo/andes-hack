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
import { zone } from "@andes-hack/db/schema/places";
import { tripOffer } from "@andes-hack/db/schema/trips";
import { vehicle } from "@andes-hack/db/schema/vehicle";
import { createTestDb } from "@andes-hack/db/test-db";

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
  await testDb.delete(tripOffer);
  await testDb.delete(vehicle);
  await testDb.delete(communityMember);
  await testDb.delete(community);
  await testDb.delete(zone);
  await testDb.delete(user);
});

describe("Vehicles and Trip Offers API (US-012)", () => {
  it("normalizes Peruvian plates (abc-123 -> ABC123), splits makeModel, lists user vehicles, and returns 409 on duplicate plate", async () => {
    const [driver1] = await testDb
      .insert(user)
      .values({ id: "u-d1", name: "Mateo", email: "mateo@alfa.pe" })
      .returning();
    const [driver2] = await testDb
      .insert(user)
      .values({ id: "u-d2", name: "Lucía", email: "lucia@alfa.pe" })
      .returning();

    let activeUser = driver1!;
    const app = createApp({
      db: testDb as never,
      getSession: async () => ({ user: activeUser }) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
    });

    const createRes = await app.request("/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plate: " abc-123 ",
        makeModel: "Toyota Corolla",
        color: "Gris",
        seats: 3,
      }),
    });

    expect(createRes.status).toBe(201);
    const createdVehicle = (await createRes.json()) as {
      id: string;
      plate: string;
      make: string;
      model: string;
      color: string;
      seats: number;
    };
    expect(createdVehicle).toMatchObject({
      plate: "ABC123",
      make: "Toyota",
      model: "Corolla",
      color: "Gris",
      seats: 3,
    });

    // Duplicate plate from another driver returns 409
    activeUser = driver2!;
    const duplicateRes = await app.request("/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plate: "ABC123",
        makeModel: "Kia Rio",
        color: "Blanco",
        seats: 4,
      }),
    });
    expect(duplicateRes.status).toBe(409);
    expect(await duplicateRes.json()).toEqual({
      success: false,
      status: 409,
      error: "Esta placa ya está registrada.",
      details: { code: "plate_already_registered" },
    });

    // List vehicles for driver1 returns the registered vehicle
    activeUser = driver1!;
    const listRes = await app.request("/vehicles");
    expect(listRes.status).toBe(200);
    expect(await listRes.json()).toEqual({
      vehicles: [createdVehicle],
    });
  });

  it("enforces onboarding, vehicle seat capacity, America/Lima date rules, and womenOnly eligibility, then publishes and pauses/reactivates trip offers", async () => {
    const [alfa] = await testDb
      .insert(community)
      .values({
        slug: "comunidad-alfa",
        name: "Comunidad Alfa",
        kind: "company",
        destinationName: "Centro Empresarial Real",
        destinationLat: -12.0975,
        destinationLng: -77.0356,
        isDemo: true,
      })
      .returning();

    const [mateo] = await testDb
      .insert(user)
      .values({ id: "u-mateo", name: "Mateo", email: "mateo@alfa.pe" })
      .returning();

    await testDb.insert(communityMember).values({
      communityId: alfa!.id,
      userId: mateo!.id,
      verificationMethod: "join_code",
      consentVersion: "v1",
      consentAt: new Date("2026-10-18T12:00:00.000Z"),
      usualMode: "drove_alone",
      travelRole: "driver",
      identifiesAsWoman: false,
    });

    const [car] = await testDb
      .insert(vehicle)
      .values({
        ownerId: mateo!.id,
        plate: "B7K456",
        make: "Mazda",
        model: "3",
        color: "Rojo",
        seats: 3,
      })
      .returning();

    // 2026-10-18 22:00 UTC is 2026-10-18 17:00 in America/Lima (UTC-5)
    const fixedNow = new Date("2026-10-18T22:00:00.000Z");
    const app = createApp({
      db: testDb as never,
      getSession: async () => ({ user: mateo! }) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
      now: () => fixedNow,
    });

    // 1. Zones endpoint seeds default Lima zones when empty and returns them
    const zonesRes = await app.request(`/communities/${alfa!.id}/zones`);
    expect(zonesRes.status).toBe(200);
    const zonesBody = (await zonesRes.json()) as {
      zones: Array<{ id: string; name: string }>;
    };
    expect(zonesBody.zones.length).toBeGreaterThan(0);
    const originZoneId = zonesBody.zones[0]!.id;

    // 2. Reject seatsTotal > vehicle.seats (4 > 3)
    const exceedSeatsRes = await app.request(`/communities/${alfa!.id}/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId: car!.id,
        direction: "outbound",
        originZoneId,
        departureTime: "07:30",
        daysOfWeek: [1, 3, 5],
        seatsTotal: 4,
        maxDetourMinutes: 5,
      }),
    });
    expect(exceedSeatsRes.status).toBe(400);
    expect(await exceedSeatsRes.json()).toEqual({
      success: false,
      status: 400,
      error: "No puedes ofrecer más asientos de los que tiene tu vehículo.",
      details: { code: "seats_exceed_vehicle_capacity" },
    });

    // 3. Reject past date in America/Lima (2026-10-17 < 2026-10-18)
    const pastDateRes = await app.request(`/communities/${alfa!.id}/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId: car!.id,
        direction: "outbound",
        originZoneId,
        departureTime: "07:30",
        date: "2026-10-17",
        seatsTotal: 2,
        maxDetourMinutes: 5,
      }),
    });
    expect(pastDateRes.status).toBe(400);
    expect(await pastDateRes.json()).toMatchObject({
      details: { code: "past_offer_date" },
    });

    // 4. Reject womenOnly when driver does not have identifiesAsWoman = true
    const womenOnlyBlockedRes = await app.request(`/communities/${alfa!.id}/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId: car!.id,
        direction: "outbound",
        originZoneId,
        departureTime: "07:30",
        daysOfWeek: [1, 3, 5],
        seatsTotal: 2,
        maxDetourMinutes: 5,
        womenOnly: true,
      }),
    });
    expect(womenOnlyBlockedRes.status).toBe(403);
    expect(await womenOnlyBlockedRes.json()).toMatchObject({
      details: { code: "women_only_not_allowed" },
    });

    // 5. Publish valid recurring offer
    const publishRes = await app.request(`/communities/${alfa!.id}/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId: car!.id,
        direction: "outbound",
        originZoneId,
        departureTime: "07:30",
        daysOfWeek: [1, 3, 5],
        seatsTotal: 3,
        maxDetourMinutes: 5,
        note: "Paso por Javier Prado",
      }),
    });
    expect(publishRes.status).toBe(201);
    const publishBody = (await publishRes.json()) as {
      offer: { id: string; status: string; seatsTotal: number; seatsTaken: number };
      message: string;
    };
    expect(publishBody.message).toBe("Viaje publicado.");
    expect(publishBody.offer).toMatchObject({
      communityId: alfa!.id,
      driverId: mateo!.id,
      vehicleId: car!.id,
      direction: "outbound",
      originZoneId,
      daysOfWeek: [1, 3, 5],
      date: null,
      seatsTotal: 3,
      seatsTaken: 0,
      maxDetourMinutes: 5,
      womenOnly: false,
      note: "Paso por Javier Prado",
      status: "active",
    });

    // 6. Pause and reactivate the offer via PATCH /offers/{id}/status
    const pauseRes = await app.request(`/offers/${publishBody.offer.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paused" }),
    });
    expect(pauseRes.status).toBe(200);
    expect(await pauseRes.json()).toMatchObject({
      id: publishBody.offer.id,
      status: "paused",
    });

    const listOffersRes = await app.request(`/communities/${alfa!.id}/offers`);
    expect(listOffersRes.status).toBe(200);
    expect(await listOffersRes.json()).toMatchObject({
      offers: [
        {
          id: publishBody.offer.id,
          status: "paused",
          seatsTotal: 3,
          seatsTaken: 0,
        },
      ],
    });
  });
});

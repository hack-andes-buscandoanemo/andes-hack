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
      isDemo: true,
    })
    .returning();
  return row!;
}

async function createMember(
  communityId: string,
  id: string,
  name: string,
  options: { identifiesAsWoman?: boolean; womenOnly?: boolean } = {},
) {
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
    identifiesAsWoman: options.identifiesAsWoman ?? false,
    womenOnly: options.womenOnly ?? false,
  });
  return person!;
}

async function createZones() {
  await testDb.insert(zone).values([
    { id: "la-molina", name: "La Molina", district: "La Molina", lat: -12.0853, lng: -76.9682 },
    { id: "san-borja", name: "San Borja", district: "San Borja", lat: -12.0897, lng: -77.0031 },
  ]);
}

function searchAs(person: { id: string }, communityId: string, body: Record<string, unknown>) {
  const app = createApp({
    db: testDb as never,
    getSession: async () => ({ user: person }) as never,
    rateLimit: async () => ({ success: true, reset: 0 }),
  });
  return app.request(`/communities/${communityId}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedOfferWithAcceptedRider(communityId: string, seatsTotal: number) {
  await createZones();
  await testDb.insert(meetingPoint).values({
    id: "la-molina-plaza-de-armas",
    zoneId: "la-molina",
    name: "Plaza de Armas de La Molina",
    kind: "park",
    lat: -12.0853,
    lng: -76.9682,
    source: "test",
  });
  const driver = await createMember(communityId, "u-mateo", "Mateo");
  const rider = await createMember(communityId, "u-rosa", "Rosa");
  const [offer] = await testDb
    .insert(tripOffer)
    .values({
      communityId,
      driverId: driver.id,
      direction: "outbound",
      originZoneId: "la-molina",
      departureTime: "07:00",
      daysOfWeek: [1, 2, 3, 4, 5],
      seatsTotal,
      maxDetourMinutes: 10,
    })
    .returning();
  const [riderNeed] = await testDb
    .insert(tripRequest)
    .values({
      communityId,
      passengerId: rider.id,
      direction: "outbound",
      originZoneId: "la-molina",
      windowStart: "07:30",
      windowEnd: "08:00",
      daysOfWeek: [1, 2, 3],
      maxWalkMinutes: 15,
      fallbackMode: "taxi_app",
    })
    .returning();
  await testDb.insert(seatBooking).values({
    offerId: offer!.id,
    requestId: riderNeed!.id,
    passengerId: rider.id,
    meetingPointId: "la-molina-plaza-de-armas",
    pickupAt: "07:02",
    detourMinutes: 0,
    walkMinutes: 0,
    status: "accepted",
  });
  return offer!;
}

function morningOffer(
  communityId: string,
  driverId: string,
  extra: Partial<typeof tripOffer.$inferInsert> = {},
) {
  return testDb
    .insert(tripOffer)
    .values({
      communityId,
      driverId,
      direction: "outbound",
      originZoneId: "la-molina",
      departureTime: "07:00",
      daysOfWeek: [1, 2, 3, 4, 5],
      seatsTotal: 3,
      maxDetourMinutes: 10,
      ...extra,
    })
    .returning();
}

const weekdayMorning = {
  direction: "outbound",
  originZoneId: "san-borja",
  windowStart: "07:30",
  windowEnd: "08:00",
  daysOfWeek: [1, 2, 3],
  fallbackMode: "taxi_app",
};

describe("POST /communities/{id}/search (US-013)", () => {
  it("finds the offer that passes near the passenger's zone, with the engine's factors", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    await createZones();
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    const [offer] = await testDb
      .insert(tripOffer)
      .values({
        communityId: alfa.id,
        driverId: driver.id,
        direction: "outbound",
        originZoneId: "la-molina",
        departureTime: "07:00",
        daysOfWeek: [1, 2, 3, 4, 5],
        seatsTotal: 3,
        maxDetourMinutes: 10,
      })
      .returning();

    const res = await searchAs(passenger, alfa.id, weekdayMorning);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { matches: unknown[]; reason: string | null };
    expect(body.reason).toBeNull();
    expect(body.matches).toEqual([
      {
        offerId: offer!.id,
        driverName: "Mateo",
        originZoneName: "La Molina",
        destinationName: "Centro Empresarial Real",
        direction: "outbound",
        departureTime: "07:00:00",
        seatsFree: 3,
        meetingPointName: "Estación San Borja Sur (Línea 1)",
        pickupAt: "07:29",
        arrivalAt: "07:44",
        detourMinutes: 6,
        walkMinutes: 14,
      },
    ]);
  });

  it("leaves out paused offers", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    await createZones();
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    await testDb.insert(tripOffer).values({
      communityId: alfa.id,
      driverId: driver.id,
      direction: "outbound",
      originZoneId: "la-molina",
      departureTime: "07:00",
      daysOfWeek: [1, 2, 3, 4, 5],
      seatsTotal: 3,
      maxDetourMinutes: 10,
      status: "paused",
    });

    const res = await searchAs(passenger, alfa.id, weekdayMorning);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { matches: unknown[]; reason: string | null };
    expect(body.matches).toEqual([]);
    expect(body.reason).toBe("outside_time_window");
  });

  it("says the nearby trips are full once their seats are accepted", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    await seedOfferWithAcceptedRider(alfa.id, 1);
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");

    const res = await searchAs(passenger, alfa.id, weekdayMorning);

    const body = (await res.json()) as { matches: unknown[]; reason: string | null };
    expect(body.matches).toEqual([]);
    expect(body.reason).toBe("no_seats");
  });

  it("shows how many seats are still free after accepted passengers", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    await seedOfferWithAcceptedRider(alfa.id, 3);
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");

    const res = await searchAs(passenger, alfa.id, weekdayMorning);

    const body = (await res.json()) as { matches: { seatsFree: number }[]; reason: string | null };
    expect(body.reason).toBeNull();
    expect(body.matches.map((match) => match.seatsFree)).toEqual([2]);
  });

  it("keeps one active need per direction and saves it even when nothing matches", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    await createZones();
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    const ids = async (body: Record<string, unknown>) =>
      ((await (await searchAs(passenger, alfa.id, body)).json()) as { requestId: string })
        .requestId;

    const first = await ids(weekdayMorning);
    const second = await ids({ ...weekdayMorning, windowStart: "07:45", windowEnd: "08:15" });
    const back = await ids({
      ...weekdayMorning,
      direction: "return",
      windowStart: "18:00",
      windowEnd: "19:00",
    });

    expect(second).toBe(first);
    expect(back).not.toBe(first);
  });

  it("keeps a single open need when two searches in the same direction arrive together", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    await createZones();
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");

    const responses = await Promise.all([
      searchAs(passenger, alfa.id, weekdayMorning),
      searchAs(passenger, alfa.id, { ...weekdayMorning, windowStart: "07:45", windowEnd: "08:15" }),
    ]);
    const requestIds = await Promise.all(
      responses.map(async (res) => ((await res.json()) as { requestId: string }).requestId),
    );

    expect(responses.map((res) => res.status)).toEqual([200, 200]);
    expect(requestIds[1]).toBe(requestIds[0]);
  });

  it("records on the saved need whether the last search had at least one result", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    await createZones();
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    const hadResults = async () =>
      (await testDb.select({ value: tripRequest.hadResults }).from(tripRequest)).map(
        (row) => row.value,
      );

    await searchAs(passenger, alfa.id, weekdayMorning);
    expect(await hadResults()).toEqual([false]);

    await morningOffer(alfa.id, driver.id);
    await searchAs(passenger, alfa.id, weekdayMorning);
    expect(await hadResults()).toEqual([true]);
  });

  it("shows a Solo mujeres offer to a woman who identifies as such", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    await createZones();
    const driver = await createMember(alfa.id, "u-carla", "Carla", { identifiesAsWoman: true });
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía", { identifiesAsWoman: true });
    await morningOffer(alfa.id, driver.id, { womenOnly: true });

    const res = await searchAs(passenger, alfa.id, weekdayMorning);

    const body = (await res.json()) as { matches: { driverName: string }[] };
    expect(body.matches.map((match) => match.driverName)).toEqual(["Carla"]);
  });

  it("keeps only women drivers when the passenger asks for Solo mujeres", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    await createZones();
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía", { identifiesAsWoman: true });
    await morningOffer(alfa.id, driver.id);

    const res = await searchAs(passenger, alfa.id, { ...weekdayMorning, womenOnly: true });

    const body = (await res.json()) as { matches: unknown[]; reason: string | null };
    expect(body.matches).toEqual([]);
    expect(body.reason).toBe("women_only");
  });

  it("applies the Solo mujeres preference from the profile when the search does not say", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    await createZones();
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía", {
      identifiesAsWoman: true,
      womenOnly: true,
    });
    await morningOffer(alfa.id, driver.id);

    const res = await searchAs(passenger, alfa.id, weekdayMorning);

    const body = (await res.json()) as { matches: unknown[]; reason: string | null };
    expect(body.matches).toEqual([]);
    expect(body.reason).toBe("women_only");
  });

  it("refuses Solo mujeres to someone who did not turn that preference on", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    await createZones();
    const passenger = await createMember(alfa.id, "u-mateo", "Mateo");

    const res = await searchAs(passenger, alfa.id, { ...weekdayMorning, womenOnly: true });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      success: false,
      status: 403,
      error: "Esta preferencia solo está disponible para quienes la activaron en su perfil.",
      details: { code: "women_only_not_allowed" },
    });
  });

  it("does not offer a driver their own trip", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    await createZones();
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    await morningOffer(alfa.id, driver.id);

    const res = await searchAs(driver, alfa.id, weekdayMorning);

    const body = (await res.json()) as { matches: unknown[] };
    expect(body.matches).toEqual([]);
  });

  it("does not offer again a trip whose driver already turned the passenger down", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    await createZones();
    await testDb.insert(meetingPoint).values({
      id: "san-borja-estacion-san-borja-sur",
      zoneId: "san-borja",
      name: "Estación San Borja Sur (Línea 1)",
      kind: "rail_station",
      lat: -12.0897,
      lng: -77.0031,
      source: "test",
    });
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    const [offer] = await morningOffer(alfa.id, driver.id);
    const [need] = await testDb
      .insert(tripRequest)
      .values({
        communityId: alfa.id,
        passengerId: passenger.id,
        direction: "outbound",
        originZoneId: "san-borja",
        windowStart: "07:30",
        windowEnd: "08:00",
        daysOfWeek: [1, 2, 3],
        maxWalkMinutes: 15,
        fallbackMode: "taxi_app",
        status: "cancelled",
      })
      .returning();
    await testDb.insert(seatBooking).values({
      offerId: offer!.id,
      requestId: need!.id,
      passengerId: passenger.id,
      meetingPointId: "san-borja-estacion-san-borja-sur",
      pickupAt: "07:29",
      detourMinutes: 6,
      walkMinutes: 14,
      status: "rejected",
    });

    const res = await searchAs(passenger, alfa.id, weekdayMorning);

    const body = (await res.json()) as { matches: unknown[]; reason: string | null };
    expect(body.matches).toEqual([]);
    expect(body.reason).toBe("previously_rejected");
  });

  it("shows the visible alias of the driver instead of the account name, and nothing private", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    await createZones();
    const driver = await createMember(alfa.id, "u-mateo", "Mateo Quispe Rojas");
    await testDb
      .update(communityMember)
      .set({ alias: "Mateo Q." })
      .where(eq(communityMember.userId, driver.id));
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    await morningOffer(alfa.id, driver.id);

    const res = await searchAs(passenger, alfa.id, weekdayMorning);

    const body = (await res.json()) as { matches: { driverName: string }[] };
    expect(body.matches.map((match) => match.driverName)).toEqual(["Mateo Q."]);
    expect(JSON.stringify(body)).not.toContain("mateo@alfa.pe");
  });

  it("refuses people who do not belong to the community, and people who are not signed in", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    await createZones();
    const outsider = await createMember(
      (await createCommunity("comunidad-beta")).id,
      "u-ana",
      "Ana",
    );

    const notMember = await searchAs(outsider, alfa.id, weekdayMorning);
    const anonymous = await createApp({
      db: testDb as never,
      getSession: async () => null,
      rateLimit: async () => ({ success: true, reset: 0 }),
    }).request(`/communities/${alfa.id}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(weekdayMorning),
    });

    expect(notMember.status).toBe(403);
    expect(anonymous.status).toBe(401);
  });

  it("only looks at offers of the community being searched", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const beta = await createCommunity("comunidad-beta");
    await createZones();
    const stranger = await createMember(beta.id, "u-ana", "Ana");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    await morningOffer(beta.id, stranger.id);

    const res = await searchAs(passenger, alfa.id, weekdayMorning);

    const body = (await res.json()) as { matches: unknown[] };
    expect(body.matches).toEqual([]);
  });

  it("explains that no driver is available on the weekdays asked for", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    await createZones();
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    await morningOffer(alfa.id, driver.id, { daysOfWeek: [4, 5] });

    const res = await searchAs(passenger, alfa.id, weekdayMorning);

    const body = (await res.json()) as { matches: unknown[]; reason: string | null };
    expect(body.matches).toEqual([]);
    expect(body.reason).toBe("days_mismatch");
  });

  it("rejects a zone that does not exist", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    await createZones();
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");

    const res = await searchAs(passenger, alfa.id, {
      ...weekdayMorning,
      originZoneId: "atlantida",
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      status: 400,
      error: "Selecciona una zona de la lista.",
      details: { code: "zone_not_found" },
    });
  });

  it("answers in under a second with 100 offers in the community", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    await createZones();
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    for (let batch = 0; batch < 100; batch++) {
      await morningOffer(alfa.id, driver.id, {
        departureTime: `0${6 + (batch % 3)}:${10 + (batch % 5) * 10}`,
      });
    }

    const startedAt = performance.now();
    const res = await searchAs(passenger, alfa.id, weekdayMorning);
    const elapsed = performance.now() - startedAt;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(1000);
  });
});

describe("POST /communities/{id}/search validation (US-013)", () => {
  async function statusOf(body: Record<string, unknown>) {
    const alfa = await createCommunity("comunidad-alfa");
    await createZones();
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    return (await searchAs(passenger, alfa.id, { ...weekdayMorning, ...body })).status;
  }

  it("rejects a time of day that does not exist", async () => {
    expect(await statusOf({ windowEnd: "24:30" })).toBe(422);
  });

  it("rejects repeated days", async () => {
    expect(await statusOf({ daysOfWeek: [1, 1, 2] })).toBe(422);
  });

  it("rejects a date that already passed", async () => {
    expect(await statusOf({ daysOfWeek: null, date: "2020-01-01" })).toBe(422);
  });

  it("rejects a window that ends when it starts", async () => {
    expect(await statusOf({ windowStart: "07:30", windowEnd: "07:30" })).toBe(422);
  });
});

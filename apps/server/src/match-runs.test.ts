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
import { matchRun, matchSuggestion } from "@andes-hack/db/schema/matching";
import { meetingPoint, zone } from "@andes-hack/db/schema/places";
import { seatBooking, tripOffer, tripRequest } from "@andes-hack/db/schema/trips";
import { vehicle } from "@andes-hack/db/schema/vehicle";
import { createTestDb } from "@andes-hack/db/test-db";

import { eq } from "drizzle-orm";

import { type AppDeps, createApp } from "./index";

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
  await testDb.delete(matchSuggestion);
  await testDb.delete(matchRun);
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

// A Monday.
const MONDAY = "2026-10-19";

async function createCommunity(slug = "comunidad-alfa") {
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
  options: { role?: "member" | "admin"; alias?: string; identifiesAsWoman?: boolean } = {},
) {
  const [person] = await testDb
    .insert(user)
    .values({ id, name, email: `${id}@alfa.pe` })
    .returning();
  await testDb.insert(communityMember).values({
    communityId,
    userId: id,
    role: options.role ?? "member",
    verificationMethod: "join_code",
    consentVersion: "v1",
    consentAt: new Date("2026-10-18T12:00:00.000Z"),
    usualMode: "drove_alone",
    travelRole: "both",
    alias: options.alias ?? null,
    identifiesAsWoman: options.identifiesAsWoman ?? false,
  });
  return person!;
}

async function createPlaces() {
  await testDb
    .insert(zone)
    .values([
      { id: "la-molina", name: "La Molina", district: "La Molina", lat: -12.0853, lng: -76.9682 },
      { id: "san-borja", name: "San Borja", district: "San Borja", lat: -12.0897, lng: -77.0031 },
    ])
    .onConflictDoNothing();
  await testDb
    .insert(meetingPoint)
    .values({
      id: "san-borja-estacion-san-borja-sur",
      zoneId: "san-borja",
      name: "Estación San Borja Sur (Línea 1)",
      kind: "rail_station",
      lat: -12.1004192,
      lng: -77.001846,
      source: "test",
    })
    .onConflictDoNothing();
}

async function seedOffer(communityId: string, driverId: string, plate = "ABC123") {
  await createPlaces();
  const [car] = await testDb
    .insert(vehicle)
    .values({ ownerId: driverId, plate, make: "Toyota", model: "Corolla", color: "Gris", seats: 4 })
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
      daysOfWeek: [1, 2, 3, 4, 5],
      seatsTotal: 3,
      maxDetourMinutes: 10,
    })
    .returning();
  return offer!;
}

async function seedNeed(
  communityId: string,
  passengerId: string,
  values: Partial<typeof tripRequest.$inferInsert> = {},
) {
  await createPlaces();
  const [need] = await testDb
    .insert(tripRequest)
    .values({
      communityId,
      passengerId,
      direction: "outbound",
      originZoneId: "san-borja",
      windowStart: "07:30",
      windowEnd: "08:00",
      daysOfWeek: [1, 2, 3],
      maxWalkMinutes: 15,
      fallbackMode: "taxi_app",
      ...values,
    })
    .returning();
  return need!;
}

// The lock at the system boundary: Redis in production, a map here.
function memoryLock(held = new Map<string, string>()): NonNullable<AppDeps["journeyLock"]> {
  return {
    acquire: async (key) => {
      if (held.has(key)) return null;
      const token = crypto.randomUUID();
      held.set(key, token);
      return token;
    },
    release: async (key, token) => {
      if (held.get(key) === token) held.delete(key);
    },
  };
}

function appAs(person: { id: string } | null, deps: Partial<AppDeps> = {}) {
  return createApp({
    db: testDb as never,
    getSession: async () => (person ? ({ user: person } as never) : null),
    rateLimit: async () => ({ success: true, reset: 0 }),
    journeyLock: memoryLock(),
    ...deps,
  });
}

function runMatching(
  person: { id: string } | null,
  communityId: string,
  body: Record<string, unknown> = { direction: "outbound", date: MONDAY },
  deps: Partial<AppDeps> = {},
) {
  return appAs(person, deps).request(`/communities/${communityId}/match-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /communities/{id}/match-runs (US-019)", () => {
  it("saves both strategies with their metrics and recommends the seat the engine finds", async () => {
    const alfa = await createCommunity();
    const admin = await createMember(alfa.id, "u-admin", "Admin", { role: "admin" });
    const driver = await createMember(alfa.id, "u-mateo", "Mateo", { alias: "Mateo Q." });
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);
    const need = await seedNeed(alfa.id, lucia.id);

    const res = await runMatching(admin, alfa.id);

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      direction: "outbound",
      date: MONDAY,
      optimizer: {
        id: expect.any(String),
        carTripsAvoided: 1,
        passengersMatched: 1,
        detourMinutes: 6,
        walkMinutes: 14,
        unassigned: 0,
        offers: 1,
        requests: 1,
        durationMs: expect.any(Number),
        createdAt: expect.any(String),
      },
      firstComeFirstServed: {
        id: expect.any(String),
        carTripsAvoided: 1,
        passengersMatched: 1,
        detourMinutes: 6,
        walkMinutes: 14,
        unassigned: 0,
        offers: 1,
        requests: 1,
        durationMs: expect.any(Number),
        createdAt: expect.any(String),
      },
      suggestions: [
        {
          id: expect.any(String),
          offerId: offer.id,
          driverName: "Mateo Q.",
          requestId: need.id,
          passengerName: "Lucía",
          meetingPointName: "Estación San Borja Sur (Línea 1)",
          pickupAt: "07:29",
          arrivalAt: "07:44",
          detourMinutes: 6,
          walkMinutes: 14,
          avoidsCarTrip: true,
          status: "proposed",
        },
      ],
    });
  });

  it("never recommends a man driver to a woman whose need asked for Solo mujeres", async () => {
    const alfa = await createCommunity();
    const admin = await createMember(alfa.id, "u-admin", "Admin", { role: "admin" });
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía", { identifiesAsWoman: true });
    await seedOffer(alfa.id, driver.id);
    await seedNeed(alfa.id, lucia.id, { womenOnly: true });

    const res = await runMatching(admin, alfa.id);

    const body = (await res.json()) as {
      optimizer: { passengersMatched: number; unassigned: number };
      suggestions: unknown[];
    };
    expect(body.optimizer).toMatchObject({ passengersMatched: 0, unassigned: 1 });
    expect(body.suggestions).toEqual([]);
  });

  it("lets only an administrator of that community run it", async () => {
    const alfa = await createCommunity();
    const beta = await createCommunity("comunidad-beta");
    const member = await createMember(alfa.id, "u-lucia", "Lucía");
    const betaAdmin = await createMember(beta.id, "u-beta", "Beta", { role: "admin" });
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    await seedOffer(alfa.id, driver.id);

    const asMember = await runMatching(member, alfa.id);
    const fromOutside = await runMatching(betaAdmin, alfa.id);
    const anonymous = await runMatching(null, alfa.id);

    expect(asMember.status).toBe(403);
    expect(await asMember.json()).toEqual({
      success: false,
      status: 403,
      error: "Solo un administrador puede ejecutar el emparejamiento.",
      details: { code: "admin_required" },
    });
    expect(fromOutside.status).toBe(403);
    expect(((await fromOutside.json()) as { details: unknown }).details).toEqual({
      code: "community_membership_required",
    });
    expect(anonymous.status).toBe(401);
  });

  it("refuses a second run while the journey is being matched and creates no runs", async () => {
    const alfa = await createCommunity();
    const admin = await createMember(alfa.id, "u-admin", "Admin", { role: "admin" });
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    await seedOffer(alfa.id, driver.id);
    const held = new Map([[`match-run:${alfa.id}:outbound:${MONDAY}`, "someone-else"]]);

    const res = await runMatching(admin, alfa.id, undefined, { journeyLock: memoryLock(held) });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      success: false,
      status: 409,
      error: "Ya hay un emparejamiento en curso para esta jornada.",
      details: { code: "match_run_in_progress" },
    });
    const latest = await appAs(admin).request(`/communities/${alfa.id}/match-runs/latest`);
    expect(latest.status).toBe(404);
  });

  it("releases the journey after a run, so the admin can run it again", async () => {
    const alfa = await createCommunity();
    const admin = await createMember(alfa.id, "u-admin", "Admin", { role: "admin" });
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    await seedOffer(alfa.id, driver.id);
    const lock = memoryLock();

    const first = await runMatching(admin, alfa.id, undefined, { journeyLock: lock });
    const again = await runMatching(admin, alfa.id, undefined, { journeyLock: lock });

    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
  });

  it("says when the journey has neither offers nor needs", async () => {
    const alfa = await createCommunity();
    const admin = await createMember(alfa.id, "u-admin", "Admin", { role: "admin" });
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    await seedOffer(alfa.id, driver.id);

    // The offer runs Monday to Friday; this Sunday has nothing.
    const res = await runMatching(admin, alfa.id, { direction: "outbound", date: "2026-10-18" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      success: false,
      status: 409,
      error: "No hay ofertas ni necesidades para esta jornada.",
      details: { code: "no_journey_inputs" },
    });
  });

  it("replaces the earlier recommendations of the journey with the new run's", async () => {
    const alfa = await createCommunity();
    const admin = await createMember(alfa.id, "u-admin", "Admin", { role: "admin" });
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const rosa = await createMember(alfa.id, "u-rosa", "Rosa");
    await seedOffer(alfa.id, driver.id);
    await seedNeed(alfa.id, lucia.id);
    const first = (await (await runMatching(admin, alfa.id)).json()) as {
      suggestions: { id: string; passengerName: string }[];
    };
    await seedNeed(alfa.id, rosa.id);

    const second = (await (await runMatching(admin, alfa.id)).json()) as {
      suggestions: { id: string; passengerName: string }[];
    };

    expect(first.suggestions.map((s) => s.passengerName)).toEqual(["Lucía"]);
    expect(second.suggestions.map((s) => s.passengerName).toSorted()).toEqual(["Lucía", "Rosa"]);
    expect(second.suggestions.map((s) => s.id)).not.toContain(first.suggestions[0]!.id);
    const latest = (await (
      await appAs(admin).request(`/communities/${alfa.id}/match-runs/latest`)
    ).json()) as { suggestions: unknown[] };
    expect(latest.suggestions).toEqual(second.suggestions);
  });

  it("validates the journey", async () => {
    const alfa = await createCommunity();
    const admin = await createMember(alfa.id, "u-admin", "Admin", { role: "admin" });

    const res = await runMatching(admin, alfa.id, { direction: "sideways", date: "mañana" });
    const noSuchDay = await runMatching(admin, alfa.id, {
      direction: "outbound",
      date: "2026-02-30",
    });

    expect(res.status).toBe(422);
    expect(noSuchDay.status).toBe(422);
  });
});

describe("GET /communities/{id}/proposals (US-019)", () => {
  const proposalsFor = async (person: { id: string }, communityId: string) =>
    (await (await appAs(person).request(`/communities/${communityId}/proposals`)).json()) as {
      proposals: unknown[];
    };

  it("shows a passenger without a request the seat recommended to them, until they ask for it", async () => {
    const alfa = await createCommunity();
    const admin = await createMember(alfa.id, "u-admin", "Admin", { role: "admin" });
    const driver = await createMember(alfa.id, "u-mateo", "Mateo", { alias: "Mateo Q." });
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const rosa = await createMember(alfa.id, "u-rosa", "Rosa");
    const offer = await seedOffer(alfa.id, driver.id);
    await seedNeed(alfa.id, lucia.id);
    const nobody = await proposalsFor(lucia, alfa.id);

    await runMatching(admin, alfa.id);

    expect(nobody).toEqual({ proposals: [] });
    expect(await proposalsFor(lucia, alfa.id)).toEqual({
      proposals: [
        {
          suggestionId: expect.any(String),
          offerId: offer.id,
          driverName: "Mateo Q.",
          driverPhotoUrl: null,
          direction: "outbound",
          date: MONDAY,
          meetingPointName: "Estación San Borja Sur (Línea 1)",
          pickupAt: "07:29",
          arrivalAt: "07:44",
          walkMinutes: 14,
          // La Molina → Centro Empresarial Real, 15.77 km: S/ 10,04 between Mateo and Lucía.
          fuelEstimate: { tripSoles: 10.04, perOccupantSoles: 5.02, occupants: 2 },
        },
      ],
    });
    expect(await proposalsFor(rosa, alfa.id)).toEqual({ proposals: [] });

    const requested = await appAs(lucia).request(`/offers/${offer.id}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(requested.status).toBe(201);
    expect(await proposalsFor(lucia, alfa.id)).toEqual({ proposals: [] });
  });

  it("returns the recommended driver's photo signed for the passenger's community", async () => {
    const alfa = await createCommunity();
    const admin = await createMember(alfa.id, "u-admin", "Admin", { role: "admin" });
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);
    await seedNeed(alfa.id, lucia.id);
    const photoKey = `profile-photos/${driver.id}/11111111-1111-4111-8111-111111111111.jpg`;
    await testDb.update(user).set({ image: photoKey }).where(eq(user.id, driver.id));
    await runMatching(admin, alfa.id);

    const photoStorage = {
      getUploadUrl: async () => "https://r2.example/upload",
      getFileMetadata: async () => null,
      downloadFileAsBuffer: async () => Buffer.from([]),
      getDownloadUrl: async () => "https://r2.example/mateo.jpg?signature=read",
      deleteFile: async () => undefined,
    };
    const response = await appAs(lucia, { profilePhotoStorage: photoStorage }).request(
      `/communities/${alfa.id}/proposals`,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      proposals: [
        { offerId: offer.id, driverPhotoUrl: "https://r2.example/mateo.jpg?signature=read" },
      ],
    });
  });

  it("drops a proposal once its day has passed or the need is no longer open", async () => {
    const alfa = await createCommunity();
    const admin = await createMember(alfa.id, "u-admin", "Admin", { role: "admin" });
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const rosa = await createMember(alfa.id, "u-rosa", "Rosa");
    await seedOffer(alfa.id, driver.id);
    await seedNeed(alfa.id, lucia.id);
    const rosaNeed = await seedNeed(alfa.id, rosa.id);
    await runMatching(admin, alfa.id);
    await testDb
      .update(tripRequest)
      .set({ status: "cancelled" })
      .where(eq(tripRequest.id, rosaNeed.id));

    const onTheDay = await (
      await appAs(lucia, { now: () => new Date("2026-10-19T12:00:00-05:00") }).request(
        `/communities/${alfa.id}/proposals`,
      )
    ).json();
    const dayAfter = await (
      await appAs(lucia, { now: () => new Date("2026-10-20T06:00:00-05:00") }).request(
        `/communities/${alfa.id}/proposals`,
      )
    ).json();

    expect((onTheDay as { proposals: unknown[] }).proposals).toHaveLength(1);
    expect(dayAfter).toEqual({ proposals: [] });
    expect(await proposalsFor(rosa, alfa.id)).toEqual({ proposals: [] });
  });
});

describe("GET /communities/{id}/match-runs/latest (US-019)", () => {
  const latest = (person: { id: string }, communityId: string) =>
    appAs(person).request(`/communities/${communityId}/match-runs/latest`);

  it("feeds the panel the last journey run, and says when there is none yet", async () => {
    const alfa = await createCommunity();
    const admin = await createMember(alfa.id, "u-admin", "Admin", { role: "admin" });
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    await seedOffer(alfa.id, driver.id);
    await seedNeed(alfa.id, lucia.id);

    const before = await latest(admin, alfa.id);
    const ran = (await (await runMatching(admin, alfa.id)).json()) as unknown;
    const after = await latest(admin, alfa.id);

    expect(before.status).toBe(404);
    expect(await before.json()).toEqual({
      success: false,
      status: 404,
      error: "Todavía no se ejecutó ningún emparejamiento.",
      details: { code: "no_match_runs" },
    });
    expect(after.status).toBe(200);
    expect(await after.json()).toEqual(ran);
  });
});

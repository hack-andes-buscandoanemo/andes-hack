import { PublicStatsSchema } from "@andes-hack/api";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    BETTER_AUTH_SECRET: "vitest-secret-with-at-least-thirty-two-characters",
    BETTER_AUTH_URL: "http://localhost:3000",
    UPSTASH_REDIS_REST_URL: "https://example.com",
    UPSTASH_REDIS_REST_TOKEN: "vitest-token",
    CORS_ORIGIN: "http://localhost:3001",
    NODE_ENV: "test",
  });
});

import { user } from "@andes-hack/db/schema/auth";
import { community, communityMember } from "@andes-hack/db/schema/community";
import { matchRun, matchSuggestion } from "@andes-hack/db/schema/matching";
import { meetingPoint, zone } from "@andes-hack/db/schema/places";
import { seatBooking, tripOffer, tripRequest } from "@andes-hack/db/schema/trips";
import { waitlistEntry } from "@andes-hack/db/schema/waitlist";
import { createTestDb } from "@andes-hack/db/test-db";
import { eq, inArray } from "drizzle-orm";

import { createApp } from "./index";
import { createPublicStatsRoutes, type PublicStatsDeps } from "./public-stats";

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
  await testDb.delete(waitlistEntry);
  await testDb.delete(seatBooking);
  await testDb.delete(tripRequest);
  await testDb.delete(tripOffer);
  await testDb.delete(meetingPoint);
  await testDb.delete(communityMember);
  await testDb.delete(community);
  await testDb.delete(zone);
  await testDb.delete(user);
});

const NOW = new Date("2026-10-19T15:04:05.000Z");

async function seedCommunity(slug = "alfa", isDemo = false) {
  const [org] = await testDb
    .insert(community)
    .values({
      slug,
      name: "Comunidad Alfa",
      kind: "company",
      destinationName: "Centro Empresarial Real",
      destinationLat: -12.0975459,
      destinationLng: -77.0375707,
      isDemo,
    })
    .returning();
  await testDb
    .insert(zone)
    .values([
      { id: "la-molina", name: "La Molina", district: "La Molina", lat: -12.0853, lng: -76.9682 },
    ])
    .onConflictDoNothing();
  await testDb
    .insert(meetingPoint)
    .values({
      id: "la-molina-parque",
      zoneId: "la-molina",
      name: "Parque de La Molina",
      kind: "park",
      lat: -12.0853,
      lng: -76.9682,
      source: "test",
    })
    .onConflictDoNothing();
  return org!;
}

async function addMember(
  communityId: string,
  id: string,
  options: {
    isTeam?: boolean;
    travelRole?: "driver" | "passenger" | "both";
    usualMode?: "drove_alone" | "public_transport" | "taxi_app";
  } = {},
) {
  await testDb.insert(user).values({ id, name: `Persona ${id}`, email: `${id}@alfa.pe` });
  await testDb.insert(communityMember).values({
    communityId,
    userId: id,
    verificationMethod: "join_code",
    isTeam: options.isTeam ?? false,
    travelRole: options.travelRole ?? "passenger",
    usualMode: options.usualMode ?? "drove_alone",
  });
}

async function addOffer(
  communityId: string,
  driverId: string,
  options: { date?: string; status?: "active" | "paused" | "cancelled" } = {},
) {
  const [driver] = await testDb
    .select({ isTeam: communityMember.isTeam })
    .from(communityMember)
    .where(eq(communityMember.userId, driverId))
    .limit(1);
  const [offer] = await testDb
    .insert(tripOffer)
    .values({
      communityId,
      driverId,
      driverWasTeam: driver?.isTeam ?? false,
      direction: "outbound",
      originZoneId: "la-molina",
      departureTime: "07:00",
      date: options.date ?? "2099-03-02",
      seatsTotal: 3,
      maxDetourMinutes: 10,
      status: options.status ?? "active",
    })
    .returning();
  return offer!;
}

async function addBooking(
  offer: { id: string; communityId: string },
  passengerId: string,
  options: {
    status?: "pending" | "accepted" | "rejected" | "completed" | "no_show";
    originZoneId?: string;
    fallbackMode?: "drive_alone" | "taxi_app" | "public_transport" | "picked_up" | "other";
  } = {},
) {
  const [passenger] = await testDb
    .select({ isTeam: communityMember.isTeam })
    .from(communityMember)
    .where(eq(communityMember.userId, passengerId))
    .limit(1);
  const [need] = await testDb
    .insert(tripRequest)
    .values({
      communityId: offer.communityId,
      passengerId,
      direction: "outbound",
      originZoneId: options.originZoneId ?? "la-molina",
      windowStart: "06:30",
      windowEnd: "07:30",
      date: "2099-03-02",
      maxWalkMinutes: 15,
      fallbackMode: options.fallbackMode ?? "taxi_app",
      status: "matched",
    })
    .returning();
  await testDb.insert(seatBooking).values({
    offerId: offer.id,
    requestId: need!.id,
    passengerId,
    passengerWasTeam: passenger?.isTeam ?? false,
    meetingPointId: "la-molina-parque",
    pickupAt: "06:55",
    detourMinutes: 6,
    walkMinutes: 4,
    status: options.status ?? "accepted",
  });
  return need!;
}

async function addRun(
  communityId: string,
  algorithm: "fcfs" | "optimizer",
  createdAt: string,
  date = "2099-03-02",
) {
  const [run] = await testDb
    .insert(matchRun)
    .values({
      communityId,
      algorithm,
      direction: "outbound",
      date,
      inputSummary: { offers: 99, requests: 99 },
      metrics: {
        carTripsAvoided: 99,
        passengersMatched: 99,
        detourMinutes: 99,
        walkMinutes: 99,
        unassigned: 99,
      },
      durationMs: 1,
      createdAt: new Date(createdAt),
    })
    .returning();
  return run!;
}

async function addSuggestion(
  runId: string,
  offerId: string,
  requestId: string,
  passengerId: string,
  avoidsCarTrip = true,
) {
  await testDb.insert(matchSuggestion).values({
    runId,
    offerId,
    requestId,
    passengerId,
    avoidsCarTrip,
    meetingPointId: "la-molina-parque",
    position: 0,
    pickupAt: "07:00",
    arrivalAt: "07:30",
    detourMinutes: 2,
    walkMinutes: 1,
  });
}

async function addOpenNeed(
  communityId: string,
  passengerId: string,
  hadResults: boolean,
  originZoneId = "la-molina",
) {
  await testDb.insert(tripRequest).values({
    communityId,
    passengerId,
    direction: "outbound",
    originZoneId,
    windowStart: "06:30",
    windowEnd: "07:30",
    date: "2099-03-02",
    maxWalkMinutes: 15,
    fallbackMode: "taxi_app",
    status: "open",
    hadResults,
  });
}

const allowEverything: NonNullable<PublicStatsDeps["limit"]> = async () => ({
  success: true,
  reset: 0,
});

// Stands in for Upstash Redis: entries expire by the injected clock, never by real time.
function fakeCache(clock: { now: Date }): NonNullable<PublicStatsDeps["cache"]> {
  const entries = new Map<string, { value: unknown; expiresAt: number }>();
  return {
    async get(key) {
      const entry = entries.get(key);
      return entry && entry.expiresAt > clock.now.getTime() ? entry.value : null;
    },
    async set(key, value, ttlSeconds) {
      entries.set(key, { value, expiresAt: clock.now.getTime() + ttlSeconds * 1000 });
    },
  };
}

function statsApp(deps: PublicStatsDeps = {}) {
  return createPublicStatsRoutes({
    db: testDb,
    now: () => NOW,
    limit: allowEverything,
    cache: fakeCache({ now: NOW }),
    ...deps,
  });
}

describe("GET /public/communities/{slug}/stats", () => {
  it("uses the latest complete pair if a later optimizer has no baseline on that journey", async () => {
    const org = await seedCommunity();
    await addRun(org.id, "fcfs", "2026-10-19T14:00:00Z");
    await addRun(org.id, "optimizer", "2026-10-19T14:00:01Z");
    await addRun(org.id, "optimizer", "2026-10-19T15:00:00Z", "2099-03-03");
    const body = PublicStatsSchema.parse(
      await (await statsApp().request("/public/communities/alfa/stats")).json(),
    );
    expect(body.comparison).toMatchObject({ date: "2099-03-02", direction: "outbound" });
  });
  it("pairs repeated journeys before the optimizer, ignoring newer orphan baselines and other communities", async () => {
    const org = await seedCommunity();
    const other = await seedCommunity("beta");
    await addMember(org.id, "driver", { travelRole: "driver" });
    await addMember(org.id, "ana");
    const offer = await addOffer(org.id, "driver");
    const need = await addBooking(offer, "ana");
    await addRun(org.id, "fcfs", "2026-10-19T14:00:00Z");
    const baseline = await addRun(org.id, "fcfs", "2026-10-19T15:00:00Z");
    await addSuggestion(baseline.id, offer.id, need.id, "ana");
    await addRun(org.id, "optimizer", "2026-10-19T15:00:01Z");
    await addRun(org.id, "fcfs", "2026-10-19T15:00:02Z");
    await addRun(other.id, "fcfs", "2026-10-19T16:00:00Z");
    await addRun(other.id, "optimizer", "2026-10-19T16:00:01Z");
    const body = PublicStatsSchema.parse(
      await (await statsApp().request("/public/communities/alfa/stats")).json(),
    );
    expect(body.comparison?.firstComeFirstServed).toEqual({
      carTripsAvoided: 1,
      passengersMatched: 1,
    });
  });
  it("keeps deleted team members out of historical recommendations and impact", async () => {
    const org = await seedCommunity();
    const other = await seedCommunity("beta");
    await addMember(org.id, "driver", { travelRole: "driver" });
    await addMember(org.id, "team-driver", { travelRole: "driver", isTeam: true });
    await addMember(org.id, "ana");
    await addMember(org.id, "team-passenger", { isTeam: true });
    await testDb.insert(communityMember).values({
      communityId: other.id,
      userId: "ana",
      verificationMethod: "join_code",
      isTeam: true,
    });
    const offer = await addOffer(org.id, "driver");
    const teamOffer = await addOffer(org.id, "team-driver");
    const realNeed = await addBooking(offer, "ana");
    const teamNeed = await addBooking(offer, "team-passenger", { status: "completed" });
    const teamRide = await addBooking(teamOffer, "ana");
    for (const algorithm of ["fcfs", "optimizer"] as const) {
      const run = await addRun(
        org.id,
        algorithm,
        algorithm === "fcfs" ? "2026-10-19T15:00:00Z" : "2026-10-19T15:00:01Z",
      );
      await addSuggestion(run.id, offer.id, realNeed.id, "ana");
      await addSuggestion(run.id, offer.id, teamNeed.id, "team-passenger");
      await addSuggestion(run.id, teamOffer.id, teamRide.id, "ana");
    }
    await testDb.delete(user).where(inArray(user.id, ["team-driver", "team-passenger"]));
    const body = PublicStatsSchema.parse(
      await (await statsApp().request("/public/communities/alfa/stats")).json(),
    );
    expect(body.activity.acceptedRequests).toBe(1);
    expect(body.comparison?.optimizer).toEqual({ carTripsAvoided: 1, passengersMatched: 1 });
    expect(body.comparison?.firstComeFirstServed).toEqual({
      carTripsAvoided: 1,
      passengersMatched: 1,
    });
  });
  it("compares persisted recommendations rather than unfiltered run totals", async () => {
    const org = await seedCommunity();
    await addMember(org.id, "driver", { travelRole: "driver" });
    await addMember(org.id, "ana");
    const offer = await addOffer(org.id, "driver");
    const need = await addBooking(offer, "ana");
    const fcfs = await addRun(org.id, "fcfs", "2026-10-19T15:00:00Z");
    const optimizer = await addRun(org.id, "optimizer", "2026-10-19T15:00:01Z");
    await addSuggestion(fcfs.id, offer.id, need.id, "ana", false);
    await addSuggestion(optimizer.id, offer.id, need.id, "ana");
    const body = PublicStatsSchema.parse(
      await (await statsApp().request("/public/communities/alfa/stats")).json(),
    );
    expect(body.comparison).toEqual({
      date: "2099-03-02",
      direction: "outbound",
      optimizer: { carTripsAvoided: 1, passengersMatched: 1 },
      firstComeFirstServed: { carTripsAvoided: 0, passengersMatched: 1 },
    });
  });
  it("has no comparison before a matching pair has been persisted", async () => {
    await seedCommunity();
    const body = PublicStatsSchema.parse(
      await (await statsApp().request("/public/communities/alfa/stats")).json(),
    );
    expect(body.comparison).toBeNull();
  });
  it("returns computed stats when Redis writes fail and caches again after recovery", async () => {
    const org = await seedCommunity();
    await addMember(org.id, "ana");
    const recovered = fakeCache({ now: NOW });
    let unavailable = true;
    const app = statsApp({
      cache: {
        get: recovered.get,
        set: async (key, value, ttl) => {
          if (unavailable) throw new Error("Redis unavailable");
          await recovered.set(key, value, ttl);
        },
      },
    });
    const first = await app.request("/public/communities/alfa/stats");
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ activity: { enrolled: 1 } });
    unavailable = false;
    await addMember(org.id, "beto");
    expect(await (await app.request("/public/communities/alfa/stats")).json()).toMatchObject({
      activity: { enrolled: 2 },
    });
    await addMember(org.id, "carlos");
    expect(await (await app.request("/public/communities/alfa/stats")).json()).toMatchObject({
      activity: { enrolled: 2 },
    });
  });
  it("serves fresh stats when Redis reads fail and uses the cache after recovery", async () => {
    const org = await seedCommunity();
    await addMember(org.id, "ana");
    const recovered = fakeCache({ now: NOW });
    let unavailable = true;
    const app = statsApp({
      cache: {
        get: async (key) => {
          if (unavailable) throw new Error("Redis unavailable");
          return recovered.get(key);
        },
        set: recovered.set,
      },
    });
    const first = await app.request("/public/communities/alfa/stats");
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ activity: { enrolled: 1 } });
    unavailable = false;
    await addMember(org.id, "beto");
    expect(await (await app.request("/public/communities/alfa/stats")).json()).toMatchObject({
      activity: { enrolled: 1 },
    });
  });
  it("uses the passenger's origin for avoided distance, even when nearer than the driver", async () => {
    const org = await seedCommunity();
    await testDb.insert(zone).values({
      id: "destination",
      name: "Destination",
      district: "San Isidro",
      lat: org.destinationLat,
      lng: org.destinationLng,
    });
    await addMember(org.id, "driver", { travelRole: "driver" });
    await addMember(org.id, "passenger");
    const offer = await addOffer(org.id, "driver");
    await addBooking(offer, "passenger", { originZoneId: "destination" });
    const body = PublicStatsSchema.parse(
      await (await statsApp().request("/public/communities/alfa/stats")).json(),
    );
    expect(body.vehicleImpact.potential.km).toBe(-4.25);
  });
  it("counts enrolled people without the team's accounts", async () => {
    const org = await seedCommunity();
    await addMember(org.id, "ana");
    await addMember(org.id, "beto");
    await addMember(org.id, "equipo", { isTeam: true });

    const response = await statsApp().request("/public/communities/alfa/stats");

    expect(response.status).toBe(200);
    const body = (await response.json()) as { activity: { enrolled: number } };
    expect(body.activity.enrolled).toBe(2);
  });

  it("answers 404 for a community that does not exist", async () => {
    const response = await statsApp().request("/public/communities/nadie/stats");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ details: { code: "community_not_found" } });
  });

  it("answers 429 with Retry-After once an IP spends its window", async () => {
    await seedCommunity();
    const seen: string[] = [];
    const spent: NonNullable<PublicStatsDeps["limit"]> = async (identifier) => {
      seen.push(identifier);
      return { success: false, reset: NOW.getTime() + 20_000 };
    };
    const app = statsApp({ limit: spent, now: () => NOW });

    const response = await app.request("/public/communities/alfa/stats", {
      headers: { "cf-connecting-ip": "203.0.113.7" },
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("20");
    expect(seen).toEqual(["public-stats:203.0.113.7"]);
  });

  it("keys the limit on the first forwarded address when Cloudflare's header is missing", async () => {
    await seedCommunity();
    const seen: string[] = [];
    const app = statsApp({
      limit: async (identifier) => {
        seen.push(identifier);
        return { success: true, reset: 0 };
      },
    });

    await app.request("/public/communities/alfa/stats", {
      headers: { "x-forwarded-for": "198.51.100.4, 10.0.0.1" },
    });
    await app.request("/public/communities/alfa/stats", {
      headers: { "x-real-ip": "198.51.100.9" },
    });

    expect(seen).toEqual(["public-stats:198.51.100.4", "public-stats:198.51.100.9"]);
  });

  it("does not rate limit a request whose address is unknown, so one bucket never locks everyone out", async () => {
    await seedCommunity();
    const limit = vi.fn(async () => ({ success: false, reset: 0 }));

    const response = await statsApp({ limit }).request("/public/communities/alfa/stats");

    expect(response.status).toBe(200);
    expect(limit).not.toHaveBeenCalled();
  });

  it("answers from the database when the rate limiter is down", async () => {
    const org = await seedCommunity();
    await addMember(org.id, "ana");
    const limit = async () => {
      throw new Error("Redis unavailable");
    };

    const response = await statsApp({ limit }).request("/public/communities/alfa/stats", {
      headers: { "cf-connecting-ip": "203.0.113.7" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ activity: { enrolled: 1 } });
  });

  it("answers 200 when the cache rejects the write", async () => {
    await seedCommunity();
    const cache = {
      get: async () => null,
      set: async () => {
        throw new Error("Redis unavailable");
      },
    };

    const response = await statsApp({ cache }).request("/public/communities/alfa/stats");

    expect(response.status).toBe(200);
  });

  it("does not wait for a slow cache write to answer", async () => {
    await seedCommunity();
    const cache = { get: async () => null, set: () => new Promise<void>(() => undefined) };

    const response = await statsApp({ cache }).request("/public/communities/alfa/stats");

    expect(response.status).toBe(200);
  });

  it("shares one computation between concurrent requests for the same community", async () => {
    const org = await seedCommunity();
    await addMember(org.id, "ana");
    const writes: string[] = [];
    const cache = {
      get: async () => null,
      set: async (key: string) => {
        writes.push(key);
      },
    };
    const app = statsApp({ cache });

    const responses = await Promise.all([
      app.request("/public/communities/alfa/stats"),
      app.request("/public/communities/alfa/stats"),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(writes).toHaveLength(1);
  });

  it("rejects a slug that no community can have", async () => {
    const limit = vi.fn(allowEverything);
    for (const slug of ["Alfa", "a_b", `a${"b".repeat(64)}`]) {
      const response = await statsApp({ limit }).request(`/public/communities/${slug}/stats`);
      expect(response.status).toBe(422);
    }
  });

  it("remembers an unknown community for 30 seconds, so scans do not reach the database", async () => {
    const clock = { now: NOW };
    const app = statsApp({ cache: fakeCache(clock), now: () => clock.now });
    expect((await app.request("/public/communities/alfa/stats")).status).toBe(404);

    await seedCommunity();
    clock.now = new Date(NOW.getTime() + 29_000);
    const remembered = await app.request("/public/communities/alfa/stats");
    expect(remembered.status).toBe(404);
    expect(await remembered.json()).toMatchObject({ details: { code: "community_not_found" } });

    clock.now = new Date(NOW.getTime() + 31_000);
    expect((await app.request("/public/communities/alfa/stats")).status).toBe(200);
  });

  it("serves the second call within 30 seconds from the cache and recomputes after", async () => {
    const org = await seedCommunity();
    await addMember(org.id, "ana");
    const clock = { now: NOW };
    const app = statsApp({ cache: fakeCache(clock), now: () => clock.now });
    const enrolled = async () =>
      (
        (await (await app.request("/public/communities/alfa/stats")).json()) as {
          activity: { enrolled: number };
        }
      ).activity.enrolled;

    expect(await enrolled()).toBe(1);
    await addMember(org.id, "beto");
    clock.now = new Date(NOW.getTime() + 29_000);
    expect(await enrolled()).toBe(1);
    clock.now = new Date(NOW.getTime() + 31_000);
    expect(await enrolled()).toBe(2);
  });

  it("reports car trips apart from people, from the US-030 metrics and without the team", async () => {
    const org = await seedCommunity();
    await addMember(org.id, "carlos", { travelRole: "driver", usualMode: "drove_alone" });
    await addMember(org.id, "ana");
    await addMember(org.id, "beto");
    await addMember(org.id, "equipo", { isTeam: true });
    const offer = await addOffer(org.id, "carlos");
    await addBooking(offer, "ana", { fallbackMode: "taxi_app" });
    await addBooking(offer, "beto", { fallbackMode: "public_transport" });
    await addBooking(offer, "equipo", { fallbackMode: "drive_alone" });

    const response = await statsApp().request("/public/communities/alfa/stats");

    const body = (await response.json()) as Record<string, any>;
    expect(body.people).toEqual({ transported: 2, fromPublicTransport: 1 });
    expect(body.vehicleImpact.potential.trips).toBe(1);
    expect(body.vehicleImpact.potential.km).toBeCloseTo(1.39, 1);
    expect(body.vehicleImpact.potential.co2Kg).toBeCloseTo(0.35, 2);
    expect(body.vehicleImpact.verified.trips).toBe(0);
    expect(body.vehicleImpact.induced).toBe(0);
    expect(body.vehicleImpact.net).toBe(1);
  });

  it("counts a completed trip as verified and a driver who did not come by car as induced", async () => {
    const org = await seedCommunity();
    await addMember(org.id, "carlos", { travelRole: "driver", usualMode: "public_transport" });
    await addMember(org.id, "ana");
    const offer = await addOffer(org.id, "carlos", { date: "2020-03-02" });
    await addBooking(offer, "ana", { status: "completed", fallbackMode: "taxi_app" });

    const response = await statsApp().request("/public/communities/alfa/stats");

    const body = (await response.json()) as Record<string, any>;
    expect(body.vehicleImpact.verified.trips).toBe(1);
    expect(body.vehicleImpact.verified.km).toBeCloseTo(5.64, 1);
    expect(body.vehicleImpact.induced).toBe(1);
    expect(body.vehicleImpact.net).toBe(0);
  });

  it("fills the activity cards from real rows, leaving the team out of every one", async () => {
    const org = await seedCommunity();
    await addMember(org.id, "carlos", { travelRole: "both" });
    await addMember(org.id, "dani", { travelRole: "driver" });
    await addMember(org.id, "equipo", { travelRole: "driver", isTeam: true });
    await addMember(org.id, "ana");
    await addMember(org.id, "beto");
    const active = await addOffer(org.id, "carlos");
    await addOffer(org.id, "dani", { status: "paused" });
    await addOffer(org.id, "equipo");
    await addBooking(active, "ana", { status: "accepted" });
    await addBooking(active, "beto", { status: "completed" });
    await addOpenNeed(org.id, "ana", true);
    await addOpenNeed(org.id, "beto", false);
    await addOpenNeed(org.id, "equipo", true);

    const response = await statsApp().request("/public/communities/alfa/stats");

    const body = (await response.json()) as Record<string, any>;
    expect(body.activity).toEqual({
      enrolled: 4,
      drivers: 2,
      activeOffers: 1,
      openNeeds: 2,
      coverage: 0.5,
      acceptedRequests: 2,
      completedTrips: 1,
      incidentReports: 0,
    });
    // Aggregates only: no names or emails of the people behind the numbers.
    expect(JSON.stringify(body)).not.toMatch(/alfa\.pe|Persona/);
  });

  it("names the community, flags synthetic data and stamps the server time", async () => {
    await seedCommunity("alfa", false);
    await seedCommunity("sintetica", true);

    const alfa = await (await statsApp().request("/public/communities/alfa/stats")).json();
    const synthetic = await (
      await statsApp().request("/public/communities/sintetica/stats")
    ).json();

    expect(alfa).toMatchObject({
      community: { name: "Comunidad Alfa", isDemo: false },
      updatedAt: "2026-10-19T15:04:05.000Z",
    });
    expect(synthetic).toMatchObject({ community: { isDemo: true } });
  });

  it("shows a district as less than 10 until ten different people travel from it", async () => {
    const org = await seedCommunity();
    await testDb.insert(zone).values({
      id: "san-borja",
      name: "San Borja",
      district: "San Borja",
      lat: -12.0897,
      lng: -77.0031,
    });
    for (let i = 0; i < 10; i += 1) {
      await addMember(org.id, `molina-${i}`);
      await addOpenNeed(org.id, `molina-${i}`, true, "la-molina");
    }
    for (let i = 0; i < 4; i += 1) {
      await addMember(org.id, `borja-${i}`);
      await addOpenNeed(org.id, `borja-${i}`, true, "san-borja");
    }

    const response = await statsApp().request("/public/communities/alfa/stats");

    const body = (await response.json()) as { districts: unknown };
    expect(body.districts).toEqual([
      { district: "La Molina", people: 10 },
      { district: "San Borja", people: null },
    ]);
    expect(JSON.stringify(body)).not.toContain('"people":4');
  });

  it("includes the waitlist totals", async () => {
    await seedCommunity();
    await testDb.insert(waitlistEntry).values([
      { kind: "institution", institution: "Empresa Beta", email: "a@beta.pe", consent: true },
      { kind: "institution", institution: "Empresa Gamma", email: "b@gamma.pe", consent: true },
      { kind: "individual", institution: "Empresa Beta", email: "c@beta.pe", consent: true },
    ]);

    const body = (await (await statsApp().request("/public/communities/alfa/stats")).json()) as {
      waitlist: unknown;
    };

    expect(body.waitlist).toEqual({ institutions: 2, individuals: 1 });
  });

  it("is open to anyone through the whole app, without a session", async () => {
    const org = await seedCommunity();
    await addMember(org.id, "ana");
    const app = createApp({
      db: testDb as never,
      getSession: async () => null,
      statsRateLimit: allowEverything,
      statsCache: fakeCache({ now: NOW }),
    });

    const response = await app.request("/public/communities/alfa/stats");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ activity: { enrolled: 1 } });
  });
});

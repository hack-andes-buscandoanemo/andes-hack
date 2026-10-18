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
import { incidentReport } from "@andes-hack/db/schema/incident-report";
import { meetingPoint, zone } from "@andes-hack/db/schema/places";
import { seatBooking, tripMessage, tripOffer, tripRequest } from "@andes-hack/db/schema/trips";
import { createTestDb } from "@andes-hack/db/test-db";

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
  await testDb.delete(incidentReport);
  await testDb.delete(tripMessage);
  await testDb.delete(seatBooking);
  await testDb.delete(tripRequest);
  await testDb.delete(tripOffer);
  await testDb.delete(communityMember);
  await testDb.delete(community);
  await testDb.delete(meetingPoint);
  await testDb.delete(zone);
  await testDb.delete(user);
});

async function createCommunity() {
  const [row] = await testDb
    .insert(community)
    .values({
      slug: "comunidad-alfa",
      name: "Comunidad Alfa",
      kind: "company",
      destinationName: "Centro Empresarial Real",
      destinationLat: -12.0975459,
      destinationLng: -77.0375707,
    })
    .returning();
  return row!;
}

async function createMember(communityId: string, id: string, role: "member" | "admin" = "member") {
  const [person] = await testDb
    .insert(user)
    .values({ id, name: id, email: `${id}@alfa.pe` })
    .returning();
  await testDb.insert(communityMember).values({
    communityId,
    userId: id,
    role,
    verificationMethod: "join_code",
    consentVersion: "v1",
    consentAt: new Date("2026-10-18T12:00:00.000Z"),
    usualMode: "drove_alone",
    travelRole: "driver",
  });
  return person!;
}

async function createOffer(communityId: string, driverId: string) {
  await testDb.insert(zone).values({
    id: "la-molina",
    name: "La Molina",
    district: "La Molina",
    lat: -12.0853,
    lng: -76.9682,
  });
  const [offer] = await testDb
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
    })
    .returning();
  return offer!;
}

function appAs(person: { id: string } | null, deps: Partial<AppDeps> = {}) {
  return createApp({
    db: testDb as never,
    getSession: async () => (person ? ({ user: person } as never) : null),
    rateLimit: async () => ({ success: true, reset: 0 }),
    ...deps,
  });
}

describe("POST /incident-reports (US-027)", () => {
  it("records a participant's report with server time without exposing the reporter", async () => {
    const alfa = await createCommunity();
    const reporter = await createMember(alfa.id, "u-reporter");
    const offer = await createOffer(alfa.id, reporter.id);
    const createdAt = "2026-10-18T17:30:00.000Z";

    const response = await appAs(reporter, { now: () => new Date(createdAt) }).request(
      "/incident-reports",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: offer.id, type: "inappropriate_behavior" }),
      },
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      status: 201,
      data: { id: expect.any(String), status: "open", createdAt },
    });
  });

  it("requires a session and reuses the existing write rate limit", async () => {
    const alfa = await createCommunity();
    const reporter = await createMember(alfa.id, "u-reporter");
    const offer = await createOffer(alfa.id, reporter.id);
    const request = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId: offer.id, type: "other" }),
    } as const;

    expect((await appAs(null).request("/incident-reports", request)).status).toBe(401);
    const limited = await appAs(reporter, {
      rateLimit: async () => ({ success: false, reset: Date.now() + 60_000 }),
    }).request("/incident-reports", request);
    expect(limited.status).toBe(429);
  });

  it("rejects a description longer than 1000 characters", async () => {
    const alfa = await createCommunity();
    const reporter = await createMember(alfa.id, "u-reporter");
    const offer = await createOffer(alfa.id, reporter.id);

    const response = await appAs(reporter).request("/incident-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId: offer.id, type: "other", description: "x".repeat(1001) }),
    });

    expect(response.status).toBe(422);
  });

  it("accepts a passenger who has an accepted seat on the trip", async () => {
    const alfa = await createCommunity();
    const driver = await createMember(alfa.id, "u-driver");
    const passenger = await createMember(alfa.id, "u-passenger");
    const offer = await createOffer(alfa.id, driver.id);
    await testDb.insert(meetingPoint).values({
      id: "la-molina-punto",
      zoneId: "la-molina",
      name: "Punto de encuentro",
      kind: "other",
      lat: -12.0853,
      lng: -76.9682,
      source: "test",
    });
    const [request] = await testDb
      .insert(tripRequest)
      .values({
        communityId: alfa.id,
        passengerId: passenger.id,
        direction: "outbound",
        originZoneId: "la-molina",
        windowStart: "07:00",
        windowEnd: "08:00",
        daysOfWeek: [1, 2, 3, 4, 5],
        maxWalkMinutes: 15,
        fallbackMode: "taxi_app",
        status: "matched",
      })
      .returning();
    await testDb.insert(seatBooking).values({
      offerId: offer.id,
      requestId: request!.id,
      passengerId: passenger.id,
      meetingPointId: "la-molina-punto",
      pickupAt: "07:00",
      detourMinutes: 0,
      walkMinutes: 0,
      status: "accepted",
    });

    const response = await appAs(passenger).request("/incident-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId: offer.id, type: "harassment" }),
    });

    expect(response.status).toBe(201);
  });

  it("lets a community admin see reports without exposing the reporter id", async () => {
    const alfa = await createCommunity();
    const reporter = await createMember(alfa.id, "u-reporter");
    const admin = await createMember(alfa.id, "u-admin", "admin");
    const offer = await createOffer(alfa.id, reporter.id);
    const createdAt = "2026-10-18T17:30:00.000Z";
    const submitted = await appAs(reporter, { now: () => new Date(createdAt) }).request(
      "/incident-reports",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: offer.id, type: "no_show" }),
      },
    );
    const { data } = (await submitted.json()) as { data: { id: string } };

    const response = await appAs(admin).request(`/communities/${alfa.id}/incident-reports`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reports: [
        {
          id: data.id,
          offerId: offer.id,
          reportedUserId: null,
          reportedUserName: null,
          messageId: null,
          type: "no_show",
          description: null,
          status: "open",
          createdAt,
        },
      ],
    });
  });

  it("lets a community admin mark a report as reviewed", async () => {
    const alfa = await createCommunity();
    const reporter = await createMember(alfa.id, "u-reporter");
    const admin = await createMember(alfa.id, "u-admin", "admin");
    const offer = await createOffer(alfa.id, reporter.id);
    const submitted = await appAs(reporter).request("/incident-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId: offer.id, type: "dangerous_driving" }),
    });
    const { data } = (await submitted.json()) as { data: { id: string } };

    const response = await appAs(admin).request(`/incident-reports/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "reviewed" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: data.id, status: "reviewed" });
  });

  it("links a chat report to its message and sender without returning message text", async () => {
    const alfa = await createCommunity();
    const driver = await createMember(alfa.id, "u-driver");
    const passenger = await createMember(alfa.id, "u-passenger");
    const admin = await createMember(alfa.id, "u-admin", "admin");
    const offer = await createOffer(alfa.id, driver.id);
    await testDb.insert(meetingPoint).values({
      id: "la-molina-punto",
      zoneId: "la-molina",
      name: "Punto de encuentro",
      kind: "other",
      lat: -12.0853,
      lng: -76.9682,
      source: "test",
    });
    const [request] = await testDb
      .insert(tripRequest)
      .values({
        communityId: alfa.id,
        passengerId: passenger.id,
        direction: "outbound",
        originZoneId: "la-molina",
        windowStart: "07:00",
        windowEnd: "08:00",
        daysOfWeek: [1, 2, 3, 4, 5],
        maxWalkMinutes: 15,
        fallbackMode: "taxi_app",
        status: "matched",
      })
      .returning();
    await testDb.insert(seatBooking).values({
      offerId: offer.id,
      requestId: request!.id,
      passengerId: passenger.id,
      meetingPointId: "la-molina-punto",
      pickupAt: "07:00",
      detourMinutes: 0,
      walkMinutes: 0,
      status: "accepted",
    });
    const [message] = await testDb
      .insert(tripMessage)
      .values({ offerId: offer.id, senderId: passenger.id, body: "No respetó el punto acordado." })
      .returning();
    const submitted = await appAs(driver).request("/incident-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offerId: offer.id,
        type: "inappropriate_behavior",
        messageId: message!.id,
      }),
    });
    const { data } = (await submitted.json()) as { data: { id: string } };

    const response = await appAs(admin).request(`/communities/${alfa.id}/incident-reports`);
    const body = (await response.json()) as { reports: Array<Record<string, unknown>> };

    expect(response.status).toBe(200);
    expect(body.reports[0]).toMatchObject({
      id: data.id,
      reportedUserId: passenger.id,
      reportedUserName: passenger.name,
      messageId: message!.id,
      type: "inappropriate_behavior",
    });
    expect(JSON.stringify(body)).not.toContain("No respetó el punto acordado.");
  });

  it("rejects a reported person who did not participate in the trip", async () => {
    const alfa = await createCommunity();
    const driver = await createMember(alfa.id, "u-driver");
    const outsider = await createMember(alfa.id, "u-outsider");
    const offer = await createOffer(alfa.id, driver.id);

    const response = await appAs(driver).request("/incident-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offerId: offer.id,
        type: "harassment",
        reportedUserId: outsider.id,
      }),
    });

    expect(response.status).toBe(422);
  });

  it("blocks nonparticipants and administrators from other communities", async () => {
    const alfa = await createCommunity();
    const beta = await testDb
      .insert(community)
      .values({
        slug: "comunidad-beta",
        name: "Comunidad Beta",
        kind: "company",
        destinationName: "Centro Empresarial Real",
        destinationLat: -12.0975459,
        destinationLng: -77.0375707,
      })
      .returning();
    const driver = await createMember(alfa.id, "u-driver");
    const nonparticipant = await createMember(alfa.id, "u-nonparticipant");
    const otherAdmin = await createMember(beta![0]!.id, "u-other-admin", "admin");
    const offer = await createOffer(alfa.id, driver.id);
    const forbiddenSubmission = await appAs(nonparticipant).request("/incident-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId: offer.id, type: "other" }),
    });
    expect(forbiddenSubmission.status).toBe(403);

    const submitted = await appAs(driver).request("/incident-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId: offer.id, type: "other" }),
    });
    const { data } = (await submitted.json()) as { data: { id: string } };
    const forbiddenList = await appAs(otherAdmin).request(
      `/communities/${alfa.id}/incident-reports`,
    );
    const forbiddenReview = await appAs(otherAdmin).request(`/incident-reports/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "reviewed" }),
    });
    expect(forbiddenList.status).toBe(403);
    expect(forbiddenReview.status).toBe(403);
  });
});

describe("GET /public/communities/{slug}/stats (US-027)", () => {
  it("shows only the aggregate report count and suppresses groups under ten", async () => {
    const alfa = await createCommunity();
    const reporter = await createMember(alfa.id, "u-reporter");
    const offer = await createOffer(alfa.id, reporter.id);
    const report = () =>
      appAs(reporter).request("/incident-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: offer.id, type: "other", description: "dato privado" }),
      });
    const deps = {
      statsRateLimit: async () => ({ success: true, reset: 0 }),
      statsCache: { get: async () => null, set: async () => {} },
    };
    const empty = await appAs(null, deps).request("/public/communities/comunidad-alfa/stats");
    expect(
      ((await empty.json()) as { activity: { incidentReports: number | null } }).activity
        .incidentReports,
    ).toBe(0);

    for (let i = 0; i < 9; i += 1) await report();

    const suppressed = await appAs(null, deps).request("/public/communities/comunidad-alfa/stats");
    const suppressedBody = await suppressed.json();
    expect(
      (suppressedBody as { activity: { incidentReports: number | null } }).activity.incidentReports,
    ).toBe(null);
    expect(JSON.stringify(suppressedBody)).not.toContain("dato privado");
    expect(JSON.stringify(suppressedBody)).not.toContain("u-reporter");

    await report();
    const visible = await appAs(null, deps).request("/public/communities/comunidad-alfa/stats");
    expect(
      ((await visible.json()) as { activity: { incidentReports: number | null } }).activity
        .incidentReports,
    ).toBe(10);
  });
});

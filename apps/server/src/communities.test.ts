import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    BETTER_AUTH_SECRET: "vitest-secret-with-at-least-thirty-two-characters",
    BETTER_AUTH_URL: "http://localhost:3000",
    UPSTASH_REDIS_REST_URL: "https://example.com",
    UPSTASH_REDIS_REST_TOKEN: "vitest-token",
    CORS_ORIGIN: "http://localhost:3001",
    TEAM_EMAILS: "equipo@tejalo.pe,admin@tejalo.pe",
    NODE_ENV: "test",
  });
});

import { user } from "@andes-hack/db/schema/auth";
import { community, communityMember } from "@andes-hack/db/schema/community";
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
  await testDb.delete(community);
});

describe("GET /communities (US-009)", () => {
  it("lists communities with only public fields and never exposes join codes or email domains", async () => {
    const [alfa] = await testDb
      .insert(community)
      .values({
        slug: "comunidad-alfa",
        name: "Comunidad Alfa",
        kind: "company",
        destinationName: "Centro Empresarial Real",
        destinationLat: -12.0975,
        destinationLng: -77.0356,
        allowedEmailDomains: ["alfa.pe"],
        joinCodeHash: "secret-hash-value",
        isDemo: true,
      })
      .returning();

    const app = createApp({
      db: testDb as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
    });

    const response = await app.request("/communities");

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      communities: Array<Record<string, unknown>>;
    };
    expect(body).toEqual({
      communities: [
        {
          id: alfa!.id,
          name: "Comunidad Alfa",
          kind: "company",
          isDemo: true,
        },
      ],
    });
    expect(body.communities[0]).not.toHaveProperty("joinCodeHash");
    expect(body.communities[0]).not.toHaveProperty("allowedEmailDomains");
  });
});

describe("POST /communities/{id}/join (US-009)", () => {
  it("verifies membership with SHA-256 join_code, is idempotent, and sets is_team only from TEAM_EMAILS", async () => {
    await testDb.delete(communityMember);
    await testDb.delete(user);

    // Known literal SHA-256 hex of "ALFA2026"
    const joinCodeHash = "a713b09644f93d06ee6458195592400b1b76babb9beecae5064d9376dfdab704";

    const [alfa] = await testDb
      .insert(community)
      .values({
        slug: "comunidad-alfa",
        name: "Comunidad Alfa",
        kind: "company",
        destinationName: "Centro Empresarial Real",
        destinationLat: -12.0975,
        destinationLng: -77.0356,
        joinCodeHash,
        isDemo: true,
      })
      .returning();

    const [regularUser] = await testDb
      .insert(user)
      .values({ id: "u-regular", name: "Carlos", email: "carlos@alfa.pe" })
      .returning();
    const [teamUser] = await testDb
      .insert(user)
      .values({ id: "u-team", name: "Diego", email: "EQUIPO@tejalo.pe" })
      .returning();

    let activeUser = regularUser!;
    const app = createApp({
      db: testDb as never,
      getSession: async () => ({ user: activeUser }) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
    });

    const firstJoin = await app.request(`/communities/${alfa!.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ALFA2026", isTeam: true }),
    });

    expect(firstJoin.status).toBe(200);
    expect(await firstJoin.json()).toEqual({
      joined: true,
      alreadyMember: false,
      communityId: alfa!.id,
      communityName: "Comunidad Alfa",
      verificationMethod: "join_code",
      isTeam: false,
      message: "¡Listo! Ya eres parte de Comunidad Alfa.",
    });

    const secondJoin = await app.request(`/communities/${alfa!.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "CUALQUIER_OTRO" }),
    });

    expect(secondJoin.status).toBe(200);
    expect(await secondJoin.json()).toEqual({
      joined: true,
      alreadyMember: true,
      communityId: alfa!.id,
      communityName: "Comunidad Alfa",
      verificationMethod: "join_code",
      isTeam: false,
      message: "¡Listo! Ya eres parte de Comunidad Alfa.",
    });

    activeUser = teamUser!;
    const teamJoin = await app.request(`/communities/${alfa!.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ALFA2026" }),
    });

    expect(teamJoin.status).toBe(200);
    expect(await teamJoin.json()).toMatchObject({
      joined: true,
      alreadyMember: false,
      verificationMethod: "join_code",
      isTeam: true,
    });
  });

  it("blocks brute-force attempts with 429 after 5 failed codes in 10 minutes even if the 6th code is valid", async () => {
    await testDb.delete(communityMember);
    await testDb.delete(user);

    const joinCodeHash = "a713b09644f93d06ee6458195592400b1b76babb9beecae5064d9376dfdab704";
    const [alfa] = await testDb
      .insert(community)
      .values({
        slug: "comunidad-alfa",
        name: "Comunidad Alfa",
        kind: "company",
        destinationName: "Centro Empresarial Real",
        destinationLat: -12.0975,
        destinationLng: -77.0356,
        joinCodeHash,
        isDemo: true,
      })
      .returning();

    const [person] = await testDb
      .insert(user)
      .values({ id: "u-brute", name: "Luis", email: "luis@alfa.pe" })
      .returning();

    const attemptsByKey = new Map<string, number>();
    const app = createApp({
      db: testDb as never,
      getSession: async () => ({ user: person! }) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
      joinRateLimit: async (key) => {
        const count = (attemptsByKey.get(key) ?? 0) + 1;
        attemptsByKey.set(key, count);
        return {
          success: count <= 5,
          reset: Date.now() + 600_000,
        };
      },
    });

    for (let i = 1; i <= 5; i += 1) {
      const wrong = await app.request(`/communities/${alfa!.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: `WRONG00${i}` }),
      });
      expect(wrong.status).toBe(400);
      expect(await wrong.json()).toEqual({
        success: false,
        status: 400,
        error: "El código no es válido para esta comunidad.",
        details: { code: "invalid_join_code" },
      });
    }

    const sixthAttemptWithValidCode = await app.request(`/communities/${alfa!.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ALFA2026" }),
    });

    expect(sixthAttemptWithValidCode.status).toBe(429);
    expect(await sixthAttemptWithValidCode.json()).toEqual({
      success: false,
      status: 429,
      error: "Demasiados intentos. Espera unos minutos.",
      details: { code: "too_many_join_attempts" },
    });

    // Public seam verification that the 6th request did not create a membership:
    attemptsByKey.clear();
    const afterWindowReset = await app.request(`/communities/${alfa!.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "STILL_NOT_A_MEMBER" }),
    });
    expect(afterWindowReset.status).toBe(400);
  });
});

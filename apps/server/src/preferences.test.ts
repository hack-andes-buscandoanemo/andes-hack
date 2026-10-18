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
  await testDb.delete(communityMember);
  await testDb.delete(community);
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

async function createMember(communityId: string, id: string, name: string) {
  const [person] = await testDb
    .insert(user)
    .values({ id, name, email: `${id}@alfa.pe` })
    .returning();
  await testDb.insert(communityMember).values({
    communityId,
    userId: id,
    verificationMethod: "join_code",
  });
  return person!;
}

function appAs(person: { id: string }) {
  return createApp({
    db: testDb as never,
    getSession: async () => ({ user: person }) as never,
    rateLimit: async () => ({ success: true, reset: 0 }),
  });
}

function savePreferences(
  person: { id: string },
  communityId: string,
  body: { identifiesAsWoman: boolean; womenOnly: boolean },
) {
  return appAs(person).request(`/communities/${communityId}/preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function myPreferences(person: { id: string }) {
  const me = (await (await appAs(person).request("/me")).json()) as {
    memberships: { identifiesAsWoman: boolean; womenOnly: boolean }[];
  };
  return me.memberships.map(({ identifiesAsWoman, womenOnly }) => ({
    identifiesAsWoman,
    womenOnly,
  }));
}

describe("travel preferences (Solo mujeres)", () => {
  it("saves Solo mujeres for a member who identifies as a woman", async () => {
    const alfa = await createCommunity();
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");

    const res = await savePreferences(lucia, alfa.id, { identifiesAsWoman: true, womenOnly: true });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      identifiesAsWoman: true,
      womenOnly: true,
      message: "Preferencia guardada.",
    });
    expect(await myPreferences(lucia)).toEqual([{ identifiesAsWoman: true, womenOnly: true }]);
  });

  it("refuses Solo mujeres without the declaration and keeps the previous preference", async () => {
    const alfa = await createCommunity();
    const mateo = await createMember(alfa.id, "u-mateo", "Mateo");

    const res = await savePreferences(mateo, alfa.id, {
      identifiesAsWoman: false,
      womenOnly: true,
    });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      success: false,
      status: 422,
      error: 'Para usar "Solo mujeres", confirma que te identificas como mujer.',
      details: { code: "women_only_requires_declaration" },
    });
    expect(await myPreferences(mateo)).toEqual([{ identifiesAsWoman: false, womenOnly: false }]);
  });

  it("refuses to save preferences in a community the person does not belong to", async () => {
    const alfa = await createCommunity();
    const [outsider] = await testDb
      .insert(user)
      .values({ id: "u-ana", name: "Ana", email: "ana@otra.pe" })
      .returning();

    const res = await savePreferences(outsider!, alfa.id, {
      identifiesAsWoman: true,
      womenOnly: true,
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ details: { code: "community_membership_required" } });
  });
});

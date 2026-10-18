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

async function createMember(
  communityId: string,
  id: string,
  options: { onboarded: boolean } = { onboarded: true },
) {
  const [person] = await testDb
    .insert(user)
    .values({ id, name: "Ana Torres", email: `${id}@alfa.pe` })
    .returning();
  await testDb.insert(communityMember).values({
    communityId,
    userId: id,
    verificationMethod: "join_code",
    ...(options.onboarded
      ? {
          consentVersion: "v1",
          consentAt: new Date("2026-10-01T12:00:00.000Z"),
          usualMode: "public_transport" as const,
          travelRole: "passenger" as const,
          alias: "Ana T.",
        }
      : {}),
  });
  return person!;
}

function appAs(person: { id: string }) {
  return createApp({
    db: testDb as never,
    getSession: async () => ({ user: person }) as never,
    rateLimit: async () => ({ success: true, reset: 0 }),
    now: () => new Date("2026-10-18T15:00:00.000Z"),
  });
}

function editProfile(person: { id: string }, communityId: string, body: Record<string, unknown>) {
  return appAs(person).request(`/communities/${communityId}/membership`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function myMembership(person: { id: string }) {
  const me = (await (await appAs(person).request("/me")).json()) as {
    memberships: Record<string, unknown>[];
  };
  return me.memberships[0];
}

describe("PATCH /communities/{id}/membership from the profile", () => {
  it("edits the alias and usual mode, keeping the consent date and the travel role", async () => {
    const alfa = await createCommunity();
    const ana = await createMember(alfa.id, "u-ana");

    const res = await editProfile(ana, alfa.id, { alias: "Anita", usualMode: "drove_alone" });

    expect(res.status).toBe(200);
    expect(await myMembership(ana)).toMatchObject({
      alias: "Anita",
      usualMode: "drove_alone",
      travelRole: "passenger",
      consentVersion: "v1",
      consentAt: "2026-10-01T12:00:00.000Z",
    });
  });

  it("asks for the consent of a member who never gave it, and saves nothing", async () => {
    const alfa = await createCommunity();
    const ana = await createMember(alfa.id, "u-ana", { onboarded: false });

    const res = await editProfile(ana, alfa.id, { alias: "Anita", usualMode: "drove_alone" });

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      error: "Debes aceptar las condiciones para continuar.",
      details: { code: "consent_required" },
    });
    expect(await myMembership(ana)).toMatchObject({
      alias: null,
      usualMode: null,
      consentAt: null,
    });
  });
});

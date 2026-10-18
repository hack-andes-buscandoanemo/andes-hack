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

import { waitlistEntry } from "@andes-hack/db/schema/waitlist";
import { createTestDb } from "@andes-hack/db/test-db";

import { createWaitlistRoutes, type WaitlistDeps } from "./waitlist";

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
  await testDb.delete(waitlistEntry);
});

const allowEverything: NonNullable<WaitlistDeps["limit"]> = async () => ({
  success: true,
  reset: 0,
});

function waitlistApp(limit = allowEverything) {
  return createWaitlistRoutes({ db: testDb, limit });
}

// A fictitious company: the waitlist never names real institutions in tests.
const pilotRequest = {
  kind: "institution",
  institution: "Empresa Beta S.A.C.",
  role: "Jefa de bienestar",
  onSiteCount: 180,
  wantsPilot: true,
  email: "bienestar@empresabeta.pe",
  consent: true,
};

function join(app: ReturnType<typeof waitlistApp>, body: object, ip = "203.0.113.10") {
  return app.request("/public/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });
}

async function summary(app: ReturnType<typeof waitlistApp>) {
  const response = await app.request("/public/waitlist/summary");
  return response.json();
}

describe("POST /public/waitlist (US-033)", () => {
  it("registers an institution that asks for a pilot and counts it, without showing emails", async () => {
    const app = waitlistApp();

    const response = await join(app, pilotRequest);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ message: "¡Gracias! Te escribiremos para coordinar." });
    expect(await summary(app)).toEqual({ institutions: 1, individuals: 0 });
  });
});

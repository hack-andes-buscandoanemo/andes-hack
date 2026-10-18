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

// Stands in for Upstash: one entry per identifier, then the window is spent.
function onePerIdentifier(): NonNullable<WaitlistDeps["limit"]> {
  const seen = new Set<string>();
  return async (identifier) => {
    const allowed = !seen.has(identifier);
    seen.add(identifier);
    return { success: allowed, reset: Date.now() + 10 * 60_000 };
  };
}

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
  it("still takes the signup when the rate limiter is down", async () => {
    const down: NonNullable<WaitlistDeps["limit"]> = async () => {
      throw new Error("Redis unavailable");
    };

    const response = await waitlistApp(down).request("/public/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
      body: JSON.stringify(pilotRequest),
    });

    expect(response.status).toBe(201);
  });

  it("registers an institution that asks for a pilot and counts it, without showing emails", async () => {
    const app = waitlistApp();

    const response = await join(app, pilotRequest);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ message: "¡Gracias! Te escribiremos para coordinar." });
    expect(await summary(app)).toEqual({ institutions: 1, individuals: 0 });
  });

  it("tells someone already on the list, even with the email in other capitals, and counts them once", async () => {
    const app = waitlistApp();
    await join(app, pilotRequest);

    const response = await join(app, { ...pilotRequest, email: "Bienestar@EmpresaBeta.pe" });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "Ya estás en la lista." });
    expect(await summary(app)).toEqual({ institutions: 1, individuals: 0 });
  });

  it("counts the same person once on each list when they also ask to be told as an individual", async () => {
    const app = waitlistApp();
    await join(app, pilotRequest);

    const response = await join(app, {
      kind: "individual",
      institution: "Empresa Beta S.A.C.",
      email: "bienestar@empresabeta.pe",
      consent: true,
    });

    expect(response.status).toBe(201);
    expect(await summary(app)).toEqual({ institutions: 1, individuals: 1 });
  });

  it("thanks a bot that filled the hidden field and stores nothing", async () => {
    const app = waitlistApp();

    const response = await join(app, { ...pilotRequest, website: "https://ofertas.example" });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ message: "¡Gracias! Te escribiremos para coordinar." });
    expect(await summary(app)).toEqual({ institutions: 0, individuals: 0 });
  });

  it("asks an address that sends too many entries to wait, while other addresses still get in", async () => {
    const app = waitlistApp(onePerIdentifier());
    await join(app, pilotRequest, "203.0.113.10");

    const again = await join(
      app,
      { ...pilotRequest, email: "rrhh@empresabeta.pe" },
      "203.0.113.10",
    );
    const elsewhere = await join(
      app,
      { ...pilotRequest, email: "facilities@empresabeta.pe" },
      "198.51.100.7",
    );

    expect(again.status).toBe(429);
    expect(await again.json()).toMatchObject({ error: "Inténtalo en unos minutos." });
    expect(elsewhere.status).toBe(201);
    expect(await summary(app)).toEqual({ institutions: 2, individuals: 0 });
  });

  it("stores no email without consent, on the individual form too", async () => {
    const app = waitlistApp();

    const response = await join(app, {
      kind: "individual",
      institution: "Empresa Beta S.A.C.",
      email: "ana@empresabeta.pe",
      consent: false,
    });

    expect(response.status).toBe(422);
    expect(await summary(app)).toEqual({ institutions: 0, individuals: 0 });
  });

  it("only counts an institution that says how many people go to its site", async () => {
    const app = waitlistApp();
    const { onSiteCount: _, ...withoutHeadCount } = pilotRequest;

    const response = await join(app, withoutHeadCount);

    expect(response.status).toBe(422);
    expect(await summary(app)).toEqual({ institutions: 0, individuals: 0 });
  });
});

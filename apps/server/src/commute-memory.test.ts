import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { createTestDb } from "@andes-hack/db/test-db";

import { atomicMemoryCommutes, commuteMemoryFromEnv } from "./commute-memory";
import { createApp } from "./index";

// A local stand-in for the Atomic Memory HTTP API (the system boundary): it implements the
// documented quick ingest, list and delete routes over an in-memory table, partitioned by
// `user_id`. It is a test fixture, not the live service.
type Row = {
  id: string;
  user_id: string;
  source_site: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

let server: Server;
let baseUrl: string;
let rows: Row[];
let seen: { method: string; path: string; authorization: string | undefined }[];
let failWith: number | null;
let hang: boolean;
// Answers within the documented status codes whose content cannot be trusted.
let emptyIngestIds: boolean;
let malformedList: boolean;
let failDeletes: boolean;
let ingestStatus: number;
let deletesKeepRecord: boolean;
let redirectAll: boolean;

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw) as Record<string, unknown>;
}

beforeEach(async () => {
  rows = [];
  seen = [];
  failWith = null;
  hang = false;
  emptyIngestIds = false;
  malformedList = false;
  failDeletes = false;
  ingestStatus = 200;
  deletesKeepRecord = false;
  redirectAll = false;
  let clock = Date.parse("2026-10-20T12:00:00.000Z");
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://fixture");
    seen.push({
      method: req.method ?? "",
      path: url.pathname,
      authorization: req.headers.authorization,
    });
    if (hang) return;
    if (redirectAll && !url.pathname.startsWith("/elsewhere")) {
      res.writeHead(307, { Location: `/elsewhere${url.pathname}${url.search}` });
      return res.end();
    }
    if (failWith) return send(res, failWith, { error: "fixture failure" });
    if (req.headers.authorization !== "Bearer amc_test_key") return send(res, 401, {});

    if (req.method === "POST" && url.pathname === "/v1/memories/ingest/quick") {
      const body = await readJson(req);
      clock += 1000;
      const row: Row = {
        id: crypto.randomUUID(),
        user_id: String(body.user_id),
        source_site: String(body.source_site),
        content: String(body.conversation),
        metadata: (body.metadata ?? {}) as Record<string, unknown>,
        created_at: new Date(clock).toISOString(),
      };
      rows.push(row);
      return send(res, ingestStatus, {
        stored_memory_ids: emptyIngestIds ? [] : [row.id],
        updated_memory_ids: [],
      });
    }
    if (req.method === "GET" && url.pathname === "/v1/memories/list") {
      if (malformedList) return send(res, 200, { items: "not a list" });
      const userId = url.searchParams.get("user_id");
      const site = url.searchParams.get("source_site");
      const memories = rows.filter(
        (row) => row.user_id === userId && (!site || row.source_site === site),
      );
      return send(res, 200, { memories, count: memories.length });
    }
    const deleting = url.pathname.match(/^\/v1\/memories\/([^/]+)$/);
    if (req.method === "DELETE" && deleting) {
      if (failDeletes) return send(res, 500, { error: "fixture failure" });
      if (deletesKeepRecord) return send(res, 200, {});
      const index = rows.findIndex(
        (row) => row.id === deleting[1] && row.user_id === url.searchParams.get("user_id"),
      );
      if (index === -1) return send(res, 404, { error: "not found" });
      rows.splice(index, 1);
      return send(res, 200, { success: true });
    }
    send(res, 404, { error: "unknown route" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const LUCIA = { id: "u-lucia", name: "Lucía", email: "lucia@alfa.pe" };

function appAs(person: { id: string } | null, options: { timeoutMs?: number } = {}) {
  return createApp({
    getSession: async () => (person ? ({ user: person } as never) : null),
    rateLimit: async () => ({ success: true, reset: 0 }),
    commuteMemory: atomicMemoryCommutes({
      apiUrl: baseUrl,
      apiKey: "amc_test_key",
      timeoutMs: options.timeoutMs,
    }),
  });
}

const remember = (app: ReturnType<typeof createApp>, windowStart: string, windowEnd: string) =>
  app.request("/me/commute-memory", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ windowStart, windowEnd }),
  });

describe("commute memory /me/commute-memory", () => {
  it("brings back the window a person asked to remember on their next visit", async () => {
    const saved = await remember(appAs(LUCIA), "07:00", "07:45");
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({
      window: { windowStart: "07:00", windowEnd: "07:45" },
      message: "Recordaremos tu horario: 7:00 a. m. a 7:45 a. m.",
    });

    const recalled = await appAs(LUCIA).request("/me/commute-memory");
    expect(recalled.status).toBe(200);
    expect(await recalled.json()).toEqual({
      enabled: true,
      window: { windowStart: "07:00", windowEnd: "07:45" },
    });
  });

  it("keeps only the corrected window when the person saves a new one", async () => {
    await remember(appAs(LUCIA), "07:00", "07:45");
    await remember(appAs(LUCIA), "06:30", "07:15");

    const recalled = await appAs(LUCIA).request("/me/commute-memory");
    expect(await recalled.json()).toEqual({
      enabled: true,
      window: { windowStart: "06:30", windowEnd: "07:15" },
    });
    expect(rows.map((row) => row.metadata)).toEqual([
      { kind: "te-jalo.commute-window", windowStart: "06:30", windowEnd: "07:15" },
    ]);
  });

  it("forgets the window when the person removes it", async () => {
    await remember(appAs(LUCIA), "07:00", "07:45");

    const forgotten = await appAs(LUCIA).request("/me/commute-memory", { method: "DELETE" });
    expect(forgotten.status).toBe(200);
    expect(await forgotten.json()).toEqual({ message: "Olvidamos tu horario." });

    const recalled = await appAs(LUCIA).request("/me/commute-memory");
    expect(await recalled.json()).toEqual({ enabled: true, window: null });
    expect(rows).toEqual([]);
  });

  it("never shows one person's window to another, whatever the request says", async () => {
    await appAs(LUCIA).request("/me/commute-memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ windowStart: "07:00", windowEnd: "07:45", userId: "u-mateo" }),
    });

    const mateo = appAs({ id: "u-mateo" });
    expect(await (await mateo.request("/me/commute-memory")).json()).toEqual({
      enabled: true,
      window: null,
    });
    await mateo.request("/me/commute-memory", { method: "DELETE" });
    expect(await (await appAs(LUCIA).request("/me/commute-memory")).json()).toEqual({
      enabled: true,
      window: { windowStart: "07:00", windowEnd: "07:45" },
    });
  });

  it("asks for a session before reaching Atomic Memory", async () => {
    const response = await appAs(null).request("/me/commute-memory");
    expect(response.status).toBe(401);
    expect(seen).toEqual([]);
  });

  it("is off without Atomic Memory settings, and the search form loses nothing", async () => {
    const app = createApp({
      getSession: async () => ({ user: LUCIA }) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
      commuteMemory: null,
    });

    expect(await (await app.request("/me/commute-memory")).json()).toEqual({
      enabled: false,
      window: null,
    });
    const saved = await remember(app, "07:00", "07:45");
    expect(saved.status).toBe(503);
    expect(await saved.json()).toMatchObject({
      details: { code: "commute_memory_disabled" },
    });
  });

  it("says the window was not confirmed when Atomic Memory fails", async () => {
    failWith = 500;

    const saved = await remember(appAs(LUCIA), "07:00", "07:45");
    expect(saved.status).toBe(502);
    expect(await saved.json()).toMatchObject({
      error:
        "No pudimos confirmar que se guardó tu horario: Atomic Memory no respondió. Inténtalo de nuevo.",
      details: { code: "commute_memory_unavailable" },
    });
    expect((await appAs(LUCIA).request("/me/commute-memory")).status).toBe(502);
  });

  it("gives up quickly when Atomic Memory does not answer", async () => {
    hang = true;
    const started = Date.now();

    const response = await appAs(LUCIA, { timeoutMs: 100 }).request("/me/commute-memory");

    expect(response.status).toBe(502);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("rejects a window that ends before it starts without calling Atomic Memory", async () => {
    const response = await remember(appAs(LUCIA), "08:00", "07:00");
    expect(response.status).toBe(422);
    expect(seen).toEqual([]);
  });

  it("sends the server's key as a bearer token and never returns it", async () => {
    const saved = await remember(appAs(LUCIA), "07:00", "07:45");

    expect(seen.every((call) => call.authorization === "Bearer amc_test_key")).toBe(true);
    expect(JSON.stringify(await saved.json())).not.toContain("amc_test_key");
  });

  it("keeps the previous window when Atomic Memory does not confirm the new one", async () => {
    await remember(appAs(LUCIA), "07:00", "07:45");
    emptyIngestIds = true;

    const corrected = await remember(appAs(LUCIA), "06:30", "07:15");

    expect(corrected.status).toBe(502);
    expect(rows.map((row) => row.metadata.windowStart)).toContain("07:00");
  });

  it("reports Atomic Memory as unavailable when its list cannot be read", async () => {
    await remember(appAs(LUCIA), "07:00", "07:45");
    malformedList = true;

    expect((await appAs(LUCIA).request("/me/commute-memory")).status).toBe(502);
    expect((await remember(appAs(LUCIA), "06:30", "07:15")).status).toBe(502);
    expect((await appAs(LUCIA).request("/me/commute-memory", { method: "DELETE" })).status).toBe(
      502,
    );
  });

  it("says so when the new window is saved but the old one could not be deleted", async () => {
    await remember(appAs(LUCIA), "07:00", "07:45");
    failDeletes = true;

    const corrected = await remember(appAs(LUCIA), "06:30", "07:15");

    expect(corrected.status).toBe(200);
    expect(await corrected.json()).toEqual({
      window: { windowStart: "06:30", windowEnd: "07:15" },
      message:
        "Recordaremos tu horario: 6:30 a. m. a 7:15 a. m. No pudimos borrar el horario anterior; puedes olvidarlo en Perfil.",
    });
    expect(await (await appAs(LUCIA).request("/me/commute-memory")).json()).toEqual({
      enabled: true,
      window: { windowStart: "06:30", windowEnd: "07:15" },
    });
  });

  it("says the window was not deleted when Atomic Memory fails to delete it", async () => {
    await remember(appAs(LUCIA), "07:00", "07:45");
    failDeletes = true;

    const forgotten = await appAs(LUCIA).request("/me/commute-memory", { method: "DELETE" });

    expect(forgotten.status).toBe(502);
    expect(await forgotten.json()).toMatchObject({
      error: "No se borró tu horario: Atomic Memory no respondió. Inténtalo de nuevo.",
    });
  });

  it("accepts a 201 from Atomic Memory once the saved window reads back", async () => {
    ingestStatus = 201;

    expect((await remember(appAs(LUCIA), "07:00", "07:45")).status).toBe(200);
    expect(await (await appAs(LUCIA).request("/me/commute-memory")).json()).toEqual({
      enabled: true,
      window: { windowStart: "07:00", windowEnd: "07:45" },
    });
  });

  it("does not claim a window was forgotten while Atomic Memory still has it", async () => {
    await remember(appAs(LUCIA), "07:00", "07:45");
    deletesKeepRecord = true;

    const forgotten = await appAs(LUCIA).request("/me/commute-memory", { method: "DELETE" });

    expect(forgotten.status).toBe(502);
    expect(await (await appAs(LUCIA).request("/me/commute-memory")).json()).toEqual({
      enabled: true,
      window: { windowStart: "07:00", windowEnd: "07:45" },
    });
  });

  it("does not follow redirects with the key", async () => {
    redirectAll = true;

    expect((await appAs(LUCIA).request("/me/commute-memory")).status).toBe(502);
    expect(seen.map((call) => call.path)).toEqual(["/v1/memories/list"]);
  });

  describe("when the person deletes their account", () => {
    async function accountApp() {
      const { db, close } = await createTestDb();
      await db.insert(user).values({ id: LUCIA.id, name: LUCIA.name, email: LUCIA.email });
      const app = createApp({
        db: db as never,
        getSession: async () => ({ user: LUCIA }) as never,
        rateLimit: async () => ({ success: true, reset: 0 }),
        commuteMemory: atomicMemoryCommutes({ apiUrl: baseUrl, apiKey: "amc_test_key" }),
      });
      return { app, close };
    }

    it("also forgets their remembered window", async () => {
      const { app, close } = await accountApp();
      await remember(app, "07:00", "07:45");

      const deleted = await app.request("/me", { method: "DELETE" });

      expect(deleted.status).toBe(200);
      expect(rows).toEqual([]);
      await close();
    });

    it("keeps the account available for retry when erasing memory fails", async () => {
      const { app, close } = await accountApp();
      await remember(app, "07:00", "07:45");
      failWith = 500;
      const deleted = await app.request("/me", { method: "DELETE" });
      expect(deleted.status).toBe(502);
      expect(await deleted.json()).toMatchObject({
        error:
          "No pudimos confirmar el borrado de tu horario en Atomic Memory. Tu cuenta sigue activa; inténtalo de nuevo.",
      });
      const profile = await app.request("/me");
      expect(profile.status).toBe(200);
      expect(((await profile.json()) as { user: unknown }).user).toEqual({
        id: LUCIA.id,
        name: LUCIA.name,
        email: LUCIA.email,
      });
      failWith = null;
      expect((await app.request("/me", { method: "DELETE" })).status).toBe(200);
      expect(rows).toEqual([]);
      expect((await app.request("/me")).status).toBe(404);
      await close();
    });
  });
});

describe("commute memory settings", () => {
  it.each([
    ["only a URL", { ATOMICMEMORY_API_URL: "https://api.atomicstrata.ai" }],
    ["only a key", { ATOMICMEMORY_API_KEY: "amc_key" }],
    [
      "a URL that is not one",
      { ATOMICMEMORY_API_URL: "not a url", ATOMICMEMORY_API_KEY: "amc_key" },
    ],
    [
      "plain HTTP to another host",
      { ATOMICMEMORY_API_URL: "http://memory.example.com", ATOMICMEMORY_API_KEY: "amc_key" },
    ],
    [
      "credentials in the URL",
      {
        ATOMICMEMORY_API_URL: "https://user:pass@api.atomicstrata.ai",
        ATOMICMEMORY_API_KEY: "amc_key",
      },
    ],
    [
      "a query in the URL",
      { ATOMICMEMORY_API_URL: "https://api.atomicstrata.ai?x=1", ATOMICMEMORY_API_KEY: "amc_key" },
    ],
  ])("turns only the feature off with %s", async (_case, settings) => {
    const app = createApp({
      getSession: async () => ({ user: LUCIA }) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
      commuteMemory: commuteMemoryFromEnv(settings),
    });

    const response = await app.request("/me/commute-memory");
    expect(await response.json()).toEqual({ enabled: false, window: null });
    expect((await app.request("/")).status).toBe(200);
  });

  it.each([
    ["HTTPS", "https://api.atomicstrata.ai"],
    ["HTTP on this machine", "http://127.0.0.1:17350"],
  ])("is on with %s", (_case, url) => {
    expect(
      commuteMemoryFromEnv({ ATOMICMEMORY_API_URL: url, ATOMICMEMORY_API_KEY: "amc_key" }),
    ).not.toBeNull();
  });
});

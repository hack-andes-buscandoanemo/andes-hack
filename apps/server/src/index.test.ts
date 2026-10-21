import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { expect, it, vi } from "vitest";
import { z } from "zod";

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

import { env } from "@andes-hack/env/server";
import app from "./index";
import { rateLimitMiddleware, requireMember, requireSession } from "./middleware";
import { errorHandler, validationHook } from "./utils/error-handler";

it("returns a consistent 422 response for invalid Zod input", async () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.post("/validated", async (c) => {
    const result = z.object({ name: z.string() }).safeParse(await c.req.json());
    if (!result.success) throw result.error;
    return c.json({ success: true });
  });

  const response = await app.request("/validated", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: 42 }),
  });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    success: false,
    status: 422,
    error: "Los datos enviados no son válidos.",
    details: { code: "validation_error", fields: ["name"] },
  });
});

it("returns the same 422 contract for OpenAPI route validation", async () => {
  const app = new OpenAPIHono({ defaultHook: validationHook });
  app.onError(errorHandler);
  app.openapi(
    createRoute({
      method: "post",
      path: "/validated",
      request: {
        body: {
          content: { "application/json": { schema: z.object({ name: z.string() }) } },
        },
      },
      responses: {
        200: {
          description: "Valid input",
          content: { "application/json": { schema: z.object({ success: z.boolean() }) } },
        },
      },
    }),
    (c) => c.json({ success: true }),
  );

  const response = await app.request("/validated", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: 42 }),
  });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    success: false,
    status: 422,
    error: "Los datos enviados no son válidos.",
    details: { code: "validation_error", fields: ["name"] },
  });
});

it("hides unexpected error details from the response", async () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.get("/failure", () => {
    throw new Error("private stack detail");
  });

  const response = await app.request("/failure");

  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    success: false,
    status: 500,
    error: "Ocurrió un error inesperado.",
    details: { code: "internal_error" },
  });
});

it("formats HTTP exceptions with a stable API error code", async () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.get("/http-error", () => {
    throw new HTTPException(401, { message: "session token leaked from internal handler" });
  });

  const response = await app.request("/http-error");

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({
    success: false,
    status: 401,
    error: "No se pudo completar la solicitud.",
    details: { code: "http_error" },
  });
});

it("requires a session before protected work", async () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.use("/protected", requireSession());
  app.get("/protected", (c) => c.json({ success: true }));

  const response = await app.request("/protected");

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({
    success: false,
    status: 401,
    error: "Inicia sesión para continuar.",
    details: { code: "unauthorized" },
  });
});

it("rejects a session without membership in the requested community", async () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.use(
    "/community",
    requireSession(async () => ({ user: { id: "member-1" } }) as never),
  );
  app.use(
    "/community",
    requireMember(
      "community-1",
      async (userId, communityId) => userId !== "member-1" || communityId !== "community-1",
    ),
  );
  app.get("/community", (c) => c.json({ memberId: c.get("user").id }));

  const response = await app.request("/community");

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    success: false,
    status: 403,
    error: "No perteneces a esta comunidad.",
    details: { code: "community_membership_required" },
  });
});

it("returns 429 with Retry-After before a limited write runs", async () => {
  const app = new Hono();
  let writeExecuted = false;
  let sessionResolved = false;
  app.onError(errorHandler);
  app.use(
    "/write",
    rateLimitMiddleware(
      async (identifier) =>
        identifier === "ip:203.0.113.10"
          ? { success: false, reset: Date.now() + 60_000 }
          : { success: true, reset: 0 },
      async () => {
        sessionResolved = true;
        return null;
      },
    ),
  );
  app.post("/write", (c) => {
    writeExecuted = true;
    return c.json({ saved: true }, 201);
  });

  const response = await app.request("/write", {
    method: "POST",
    headers: { "cf-connecting-ip": "203.0.113.10" },
  });

  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("60");
  expect(await response.json()).toEqual({
    success: false,
    status: 429,
    error: "Demasiadas solicitudes. Inténtalo en un momento.",
    details: { code: "rate_limited" },
  });
  expect(writeExecuted).toBe(false);
  expect(sessionResolved).toBe(false);
});

it("uses the trusted edge IP instead of a client supplied forwarded IP", async () => {
  const app = new Hono();
  let limitedIdentifier = "";
  app.onError(errorHandler);
  app.use(
    "/write",
    rateLimitMiddleware(async (identifier) => {
      limitedIdentifier = identifier;
      return { success: true, reset: 0 };
    }),
  );
  app.post("/write", (c) => c.json({ saved: true }, 201));

  await app.request("/write", {
    method: "POST",
    headers: {
      "cf-connecting-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.77",
    },
  });

  expect(limitedIdentifier).toBe("ip:203.0.113.10");
});

it("does not trust a forwarded IP when the trusted edge IP is missing", async () => {
  const app = new Hono();
  let limitedIdentifier = "";
  app.onError(errorHandler);
  app.use(
    "/write",
    rateLimitMiddleware(async (identifier) => {
      limitedIdentifier = identifier;
      return { success: true, reset: 0 };
    }),
  );
  app.post("/write", (c) => c.json({ saved: true }, 201));

  await app.request("/write", {
    method: "POST",
    headers: { "x-forwarded-for": "198.51.100.77" },
  });

  expect(limitedIdentifier).toBe("ip:unknown");
});

it("rate limits public authentication reads", async () => {
  const app = new Hono();
  let limitedIdentifier = "";
  app.onError(errorHandler);
  app.use(
    "/api/auth/*",
    rateLimitMiddleware(
      async (identifier) => {
        limitedIdentifier = identifier;
        return { success: true, reset: 0 };
      },
      async () => null,
    ),
  );
  app.get("/api/auth/session", (c) => c.json({ authenticated: false }));

  const response = await app.request("/api/auth/session", {
    headers: { "cf-connecting-ip": "203.0.113.10" },
  });

  expect(response.status).toBe(200);
  expect(limitedIdentifier).toBe("ip:203.0.113.10");
});

it("rejects production writes when no trusted client IP is available", async () => {
  const app = new Hono();
  let limitChecked = false;
  let writeExecuted = false;
  app.onError(errorHandler);
  app.use(
    "/write",
    rateLimitMiddleware(
      async () => {
        limitChecked = true;
        return { success: true, reset: 0 };
      },
      async () => null,
      true,
    ),
  );
  app.post("/write", (c) => {
    writeExecuted = true;
    return c.json({ saved: true }, 201);
  });

  const response = await app.request("/write", {
    method: "POST",
    headers: { "x-forwarded-for": "198.51.100.77" },
  });

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    success: false,
    status: 503,
    error: "No se pudo verificar la solicitud.",
    details: { code: "client_ip_unavailable" },
  });
  expect(limitChecked).toBe(true);
  expect(writeExecuted).toBe(false);
});

it("uses the user ID when a production session has no trusted edge IP", async () => {
  const app = new Hono();
  const identifiers: string[] = [];
  app.onError(errorHandler);
  app.use(
    "/write",
    rateLimitMiddleware(
      async (identifier) => {
        identifiers.push(identifier);
        return { success: true, reset: 0 };
      },
      async () => ({ user: { id: "member-1" } }) as never,
      true,
    ),
  );
  app.post("/write", (c) => c.json({ saved: true }, 201));

  const response = await app.request("/write", {
    method: "POST",
    headers: { "x-forwarded-for": "198.51.100.77" },
  });

  expect(response.status).toBe(201);
  expect(identifiers).toEqual(["ip:unknown", "user:member-1"]);
});

it("uses the authenticated user id for a write limit", async () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.use(
    "/write",
    requireSession(async () => ({ user: { id: "member-1" } }) as never),
  );
  app.use(
    "/write",
    rateLimitMiddleware(async (identifier) =>
      identifier === "user:member-1"
        ? { success: false, reset: Date.now() + 60_000 }
        : { success: true, reset: 0 },
    ),
  );
  app.post("/write", (c) => c.json({ saved: true }, 201));

  const response = await app.request("/write", { method: "POST" });

  expect(response.status).toBe(429);
  expect(await response.json()).toMatchObject({ details: { code: "rate_limited" } });
});

it("rate limits PUT writes like the other writes", async () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.use(
    "/write",
    requireSession(async () => ({ user: { id: "member-1" } }) as never),
  );
  app.use(
    "/write",
    rateLimitMiddleware(async () => ({ success: false, reset: Date.now() + 60_000 })),
  );
  app.put("/write", (c) => c.json({ saved: true }, 200));

  const response = await app.request("/write", { method: "PUT" });

  expect(response.status).toBe(429);
});

it("allows configured CORS methods only for the configured origin", async () => {
  const allowed = await app.request("/health", {
    method: "OPTIONS",
    headers: {
      Origin: env.CORS_ORIGIN,
      "Access-Control-Request-Method": "PATCH",
    },
  });
  const denied = await app.request("/health", {
    method: "OPTIONS",
    headers: {
      Origin: "https://untrusted.example",
      "Access-Control-Request-Method": "PATCH",
    },
  });

  expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(env.CORS_ORIGIN);
  expect(allowed.headers.get("Access-Control-Allow-Methods")).toContain("PATCH");
  expect(allowed.headers.get("Access-Control-Allow-Methods")).toContain("DELETE");
  // PUT /communities/{id}/preferences and PUT /me/commute-memory are called from the browser.
  expect(allowed.headers.get("Access-Control-Allow-Methods")).toContain("PUT");
  expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
});

it("does not publish the example private route in OpenAPI", async () => {
  const response = await app.request("/openapi.json");

  expect(response.status).toBe(200);
  const document = (await response.json()) as {
    paths: Record<string, { get?: { tags?: string[] } }>;
    servers: Array<{ url: string; description: string }>;
  };
  expect(document.paths).not.toHaveProperty("/private");
  expect(document.paths["/health"]?.get?.tags).toEqual(["Público"]);
  expect(document.servers).toContainEqual({
    url: "https://andes-hack-server-diego.diegorafaelcisnerostafur.workers.dev",
    description: "Production server",
  });
});

import {
  healthRoute,
  joinCommunityRoute,
  listCommunitiesRoute,
  OPENAPI_DOCUMENT_CONFIG,
} from "@andes-hack/api";
import { auth } from "@andes-hack/auth";
import { db as defaultDb } from "@andes-hack/db";
import { community, communityMember } from "@andes-hack/db/schema/community";
import { env } from "@andes-hack/env/server";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";

import {
  rateLimitMiddleware,
  requireSession,
  type RateLimitCheck,
  type SessionResolver,
} from "./middleware";
import { ApiError } from "./utils/api-response";
import { errorHandler, validationHook } from "./utils/error-handler";

export type AppDeps = {
  db?: typeof defaultDb;
  getSession?: SessionResolver;
  rateLimit?: RateLimitCheck;
  joinRateLimit?: RateLimitCheck;
};

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqualHex(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function isTeamEmail(
  email: string,
  rawTeamEmails = process.env.TEAM_EMAILS ?? env.TEAM_EMAILS,
): boolean {
  const normalized = email.trim().toLowerCase();
  return rawTeamEmails
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}

export function createApp(deps: AppDeps = {}) {
  const database = deps.db ?? defaultDb;
  const app = new Hono();

  app.onError(errorHandler);
  app.use(
    "/*",
    cors({
      origin: env.CORS_ORIGIN,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  );
  app.use("/*", rateLimitMiddleware(deps.rateLimit, deps.getSession));

  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  const openApiApp = new OpenAPIHono({ defaultHook: validationHook });
  openApiApp.use("/communities/:id/join", requireSession(deps.getSession));

  openApiApp.openapi(healthRoute, (c) => {
    return c.json({ status: "ok" as const });
  });

  openApiApp.openapi(listCommunitiesRoute, async (c) => {
    const rows = await database
      .select({
        id: community.id,
        name: community.name,
        kind: community.kind,
        isDemo: community.isDemo,
      })
      .from(community)
      .orderBy(asc(community.name));

    return c.json({ communities: rows }, 200);
  });

  openApiApp.openapi(joinCommunityRoute, async (c) => {
    const { id: communityId } = c.req.valid("param");
    const { code } = c.req.valid("json");
    const sessionUser = c.get("user");

    const [org] = await database
      .select({
        id: community.id,
        name: community.name,
        joinCodeHash: community.joinCodeHash,
      })
      .from(community)
      .where(eq(community.id, communityId))
      .limit(1);

    if (!org) {
      throw new ApiError(404, "Comunidad no encontrada.", { code: "community_not_found" });
    }

    const [existing] = await database
      .select({
        verificationMethod: communityMember.verificationMethod,
        isTeam: communityMember.isTeam,
      })
      .from(communityMember)
      .where(
        and(eq(communityMember.communityId, org.id), eq(communityMember.userId, sessionUser.id)),
      )
      .limit(1);

    if (existing) {
      return c.json(
        {
          joined: true as const,
          alreadyMember: true,
          communityId: org.id,
          communityName: org.name,
          verificationMethod: existing.verificationMethod,
          isTeam: existing.isTeam,
          message: `¡Listo! Ya eres parte de ${org.name}.`,
        },
        200,
      );
    }

    const checkJoinLimit: RateLimitCheck =
      deps.joinRateLimit ??
      deps.rateLimit ??
      (async (key) => {
        const { checkJoinAttemptRateLimit } = await import("./lib/rate-limit");
        return checkJoinAttemptRateLimit(key);
      });
    const joinLimitResult = await checkJoinLimit(`join:${sessionUser.id}:${org.id}`);
    if (!joinLimitResult.success) {
      c.header(
        "Retry-After",
        String(Math.max(1, Math.ceil((joinLimitResult.reset - Date.now()) / 1000))),
      );
      throw new ApiError(429, "Demasiados intentos. Espera unos minutos.", {
        code: "too_many_join_attempts",
      });
    }

    const candidateHash = await sha256Hex(code.trim());
    if (!org.joinCodeHash || !constantTimeEqualHex(candidateHash, org.joinCodeHash.toLowerCase())) {
      throw new ApiError(400, "El código no es válido para esta comunidad.", {
        code: "invalid_join_code",
      });
    }

    const teamMember = isTeamEmail(sessionUser.email);
    await database
      .insert(communityMember)
      .values({
        communityId: org.id,
        userId: sessionUser.id,
        verificationMethod: "join_code",
        isTeam: teamMember,
      })
      .onConflictDoNothing();

    return c.json(
      {
        joined: true as const,
        alreadyMember: false,
        communityId: org.id,
        communityName: org.name,
        verificationMethod: "join_code" as const,
        isTeam: teamMember,
        message: `¡Listo! Ya eres parte de ${org.name}.`,
      },
      200,
    );
  });

  openApiApp.doc31("/openapi.json", OPENAPI_DOCUMENT_CONFIG);
  openApiApp.get("/docs", apiReference({ spec: { url: "/openapi.json" } }));
  app.route("/", openApiApp);

  app.get("/", (c) => {
    return c.text("OK");
  });

  return app;
}

const app = createApp();

export default app;

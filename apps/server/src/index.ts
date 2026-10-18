import {
  getMeRoute,
  healthRoute,
  joinCommunityRoute,
  listCommunitiesRoute,
  OPENAPI_DOCUMENT_CONFIG,
  updateMembershipRoute,
  verifyEmailCommunityRoute,
} from "@andes-hack/api";
import { auth as defaultAuth, createAuth, setVerificationOtpSender } from "@andes-hack/auth";
import { db as defaultDb } from "@andes-hack/db";
import { user as userTable } from "@andes-hack/db/schema/auth";
import { community, communityMember } from "@andes-hack/db/schema/community";
import { env } from "@andes-hack/env/server";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { sendEmail as defaultSendEmail, type SendEmailOptions } from "./lib/email";
import {
  rateLimitMiddleware,
  requireSession,
  type RateLimitCheck,
  type SessionResolver,
} from "./middleware";
import { ApiError } from "./utils/api-response";
import { errorHandler, validationHook } from "./utils/error-handler";

setVerificationOtpSender(async ({ email, otp }) => {
  await defaultSendEmail({
    to: email,
    subject: "Tu código de verificación de Te Jalo",
    text: `Tu código de verificación de Te Jalo es ${otp}. Vence en 5 minutos.`,
  });
});

export type AppDeps = {
  db?: typeof defaultDb;
  getSession?: SessionResolver;
  rateLimit?: RateLimitCheck;
  joinRateLimit?: RateLimitCheck;
  otpRateLimit?: RateLimitCheck;
  sendEmail?: (options: SendEmailOptions) => Promise<unknown>;
  now?: () => Date;
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

function extractEmailDomain(email: string): string | null {
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1 || atIndex === email.length - 1) return null;
  return email
    .slice(atIndex + 1)
    .trim()
    .toLowerCase();
}

function matchAllowedDomain(email: string | undefined, allowedDomains: string[]): string | null {
  if (!email) return null;
  const userDomain = extractEmailDomain(email);
  if (!userDomain) return null;
  const match = allowedDomains.find((d) => d.trim().toLowerCase() === userDomain);
  return match ? `@${match.trim().toLowerCase()}` : null;
}

export function createApp(deps: AppDeps = {}) {
  const database = deps.db ?? defaultDb;
  const emailSender = deps.sendEmail ?? defaultSendEmail;
  const getNow = deps.now ?? (() => new Date());
  const authInstance =
    deps.db || deps.sendEmail
      ? createAuth({
          db: database,
          sendVerificationOTP: async ({ email, otp }) => {
            await emailSender({
              to: email,
              subject: "Tu código de verificación de Te Jalo",
              text: `Tu código de verificación de Te Jalo es ${otp}. Vence en 5 minutos.`,
            });
          },
        })
      : defaultAuth;

  const resolveOptionalSession: SessionResolver =
    deps.getSession ??
    (async (headers) => {
      return authInstance.api.getSession({ headers });
    });

  const app = new Hono();

  app.onError(errorHandler);
  app.use(
    "/*",
    cors({
      origin: env.CORS_ORIGIN,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "x-community-id"],
      credentials: true,
    }),
  );
  app.use("/*", rateLimitMiddleware(deps.rateLimit, deps.getSession));

  app.post("/api/auth/email-otp/send-verification-otp", async (c, next) => {
    const session = await resolveOptionalSession(c.req.raw.headers);
    const cloned = c.req.raw.clone();
    const payload = (await cloned.json().catch(() => ({}))) as {
      email?: string;
      communityId?: string;
    };
    const candidateEmail = (session?.user?.email ?? payload.email ?? "").trim();

    const communityIdHeader = c.req.header("x-community-id") ?? payload.communityId;
    if (communityIdHeader) {
      const [org] = await database
        .select({
          id: community.id,
          name: community.name,
          allowedEmailDomains: community.allowedEmailDomains,
        })
        .from(community)
        .where(eq(community.id, communityIdHeader))
        .limit(1);

      if (!org) {
        throw new ApiError(404, "Comunidad no encontrada.", { code: "community_not_found" });
      }

      if (!matchAllowedDomain(candidateEmail, org.allowedEmailDomains)) {
        throw new ApiError(
          403,
          `Tu cuenta usa un correo que no pertenece a ${org.name}. Crea tu cuenta con tu correo institucional.`,
          { code: "email_domain_not_allowed" },
        );
      }
    }

    const checkOtpLimit: RateLimitCheck =
      deps.otpRateLimit ??
      deps.rateLimit ??
      (async (key) => {
        const { checkOtpSendRateLimit } = await import("./lib/rate-limit");
        return checkOtpSendRateLimit(key);
      });
    const rateKey = `otp:${session?.user?.id ?? candidateEmail.toLowerCase()}`;
    const otpLimit = await checkOtpLimit(rateKey);
    if (!otpLimit.success) {
      c.header("Retry-After", String(Math.max(1, Math.ceil((otpLimit.reset - Date.now()) / 1000))));
      throw new ApiError(429, "Demasiados intentos. Espera unos minutos.", {
        code: "otp_rate_limited",
      });
    }

    await next();
  });

  app.on(["POST", "GET"], "/api/auth/*", (c) => authInstance.handler(c.req.raw));

  const openApiApp = new OpenAPIHono({ defaultHook: validationHook });
  openApiApp.use("/communities/:id/join", requireSession(deps.getSession));
  openApiApp.use("/communities/:id/verify-email", requireSession(deps.getSession));
  openApiApp.use("/communities/:id/membership", requireSession(deps.getSession));
  openApiApp.use("/me", requireSession(deps.getSession));

  openApiApp.openapi(healthRoute, (c) => {
    return c.json({ status: "ok" as const });
  });

  openApiApp.openapi(listCommunitiesRoute, async (c) => {
    const session = await resolveOptionalSession(c.req.raw.headers).catch(() => null);
    const rows = await database
      .select({
        id: community.id,
        name: community.name,
        kind: community.kind,
        isDemo: community.isDemo,
        allowedEmailDomains: community.allowedEmailDomains,
      })
      .from(community)
      .orderBy(asc(community.name));

    return c.json(
      {
        communities: rows.map((row) => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          isDemo: row.isDemo,
          hasEmailVerification: row.allowedEmailDomains.length > 0,
          matchedEmailDomain: matchAllowedDomain(session?.user?.email, row.allowedEmailDomains),
        })),
      },
      200,
    );
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

  openApiApp.openapi(verifyEmailCommunityRoute, async (c) => {
    const { id: communityId } = c.req.valid("param");
    const sessionUser = c.get("user");

    const [org] = await database
      .select({
        id: community.id,
        name: community.name,
        allowedEmailDomains: community.allowedEmailDomains,
      })
      .from(community)
      .where(eq(community.id, communityId))
      .limit(1);

    if (!org) {
      throw new ApiError(404, "Comunidad no encontrada.", { code: "community_not_found" });
    }

    const [dbUser] = await database
      .select({
        id: userTable.id,
        email: userTable.email,
        emailVerified: userTable.emailVerified,
      })
      .from(userTable)
      .where(eq(userTable.id, sessionUser.id))
      .limit(1);

    const userEmail = dbUser?.email ?? sessionUser.email;
    if (!matchAllowedDomain(userEmail, org.allowedEmailDomains)) {
      throw new ApiError(
        403,
        `Tu cuenta usa un correo que no pertenece a ${org.name}. Crea tu cuenta con tu correo institucional.`,
        { code: "email_domain_not_allowed" },
      );
    }

    if (!dbUser?.emailVerified) {
      throw new ApiError(400, "El código no es válido o ya venció.", {
        code: "email_not_verified",
      });
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
          message: "Pertenencia verificada.",
        },
        200,
      );
    }

    const teamMember = isTeamEmail(userEmail);
    await database
      .insert(communityMember)
      .values({
        communityId: org.id,
        userId: sessionUser.id,
        verificationMethod: "email_domain",
        isTeam: teamMember,
      })
      .onConflictDoNothing();

    return c.json(
      {
        joined: true as const,
        alreadyMember: false,
        communityId: org.id,
        communityName: org.name,
        verificationMethod: "email_domain" as const,
        isTeam: teamMember,
        message: "Pertenencia verificada.",
      },
      200,
    );
  });

  openApiApp.openapi(getMeRoute, async (c) => {
    const sessionUser = c.get("user");
    const rows = await database
      .select({
        id: communityMember.id,
        communityId: communityMember.communityId,
        communityName: community.name,
        destinationName: community.destinationName,
        role: communityMember.role,
        verificationMethod: communityMember.verificationMethod,
        consentVersion: communityMember.consentVersion,
        consentAt: communityMember.consentAt,
        usualMode: communityMember.usualMode,
        travelRole: communityMember.travelRole,
        alias: communityMember.alias,
        identifiesAsWoman: communityMember.identifiesAsWoman,
        womenOnly: communityMember.womenOnly,
        isTeam: communityMember.isTeam,
      })
      .from(communityMember)
      .innerJoin(community, eq(communityMember.communityId, community.id))
      .where(eq(communityMember.userId, sessionUser.id))
      .orderBy(asc(communityMember.createdAt));

    return c.json(
      {
        user: {
          id: sessionUser.id,
          name: sessionUser.name,
          email: sessionUser.email,
        },
        memberships: rows.map((row) => ({
          id: row.id,
          communityId: row.communityId,
          communityName: row.communityName,
          destinationName: row.destinationName,
          role: row.role,
          verificationMethod: row.verificationMethod,
          consentVersion: row.consentVersion,
          consentAt: row.consentAt ? row.consentAt.toISOString() : null,
          usualMode: row.usualMode,
          travelRole: row.travelRole,
          alias: row.alias,
          identifiesAsWoman: row.identifiesAsWoman,
          womenOnly: row.womenOnly,
          isTeam: row.isTeam,
        })),
      },
      200,
    );
  });

  openApiApp.openapi(updateMembershipRoute, async (c) => {
    const { id: communityId } = c.req.valid("param");
    const body = c.req.valid("json");
    const sessionUser = c.get("user");

    const [org] = await database
      .select({
        id: community.id,
        name: community.name,
        destinationName: community.destinationName,
      })
      .from(community)
      .where(eq(community.id, communityId))
      .limit(1);

    if (!org) {
      throw new ApiError(404, "Comunidad no encontrada.", { code: "community_not_found" });
    }

    const [existing] = await database
      .select({ id: communityMember.id })
      .from(communityMember)
      .where(
        and(eq(communityMember.communityId, org.id), eq(communityMember.userId, sessionUser.id)),
      )
      .limit(1);

    if (!existing) {
      throw new ApiError(403, "No perteneces a esta comunidad.", {
        code: "community_membership_required",
      });
    }

    const consentTime = getNow();
    const [updated] = await database
      .update(communityMember)
      .set({
        consentVersion: "v1",
        consentAt: consentTime,
        usualMode: body.usualMode,
        travelRole: body.travelRole,
        alias: body.alias ?? null,
        updatedAt: consentTime,
      })
      .where(eq(communityMember.id, existing.id))
      .returning();

    return c.json(
      {
        id: updated!.id,
        communityId: org.id,
        communityName: org.name,
        destinationName: org.destinationName,
        role: updated!.role,
        verificationMethod: updated!.verificationMethod,
        consentVersion: updated!.consentVersion,
        consentAt: updated!.consentAt ? updated!.consentAt.toISOString() : null,
        usualMode: updated!.usualMode,
        travelRole: updated!.travelRole,
        alias: updated!.alias,
        identifiesAsWoman: updated!.identifiesAsWoman,
        womenOnly: updated!.womenOnly,
        isTeam: updated!.isTeam,
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

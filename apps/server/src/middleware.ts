import type { auth } from "@andes-hack/auth";
import { env } from "@andes-hack/env/server";
import type { MiddlewareHandler } from "hono";

import { logEvent } from "./lib/logger";
import { ApiError } from "./utils/api-response";

export type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
export type SessionResolver = (headers: Headers) => Promise<Session | null>;
export type MembershipLookup = (userId: string, communityId: string) => Promise<boolean>;
export type RateLimitCheck = (identifier: string) => Promise<{ success: boolean; reset: number }>;
export type User = Session["user"];

declare module "hono" {
  interface ContextVariableMap {
    user: User;
  }
}

const resolveSession: SessionResolver = async (headers) => {
  const { auth } = await import("@andes-hack/auth");
  return auth.api.getSession({ headers });
};

const lookupMembership: MembershipLookup = async (userId, communityId) => {
  const [{ db }, { sql }] = await Promise.all([import("@andes-hack/db"), import("drizzle-orm")]);
  const result = await db.execute(
    sql`select 1 from community_member where user_id = ${userId} and community_id = ${communityId} limit 1`,
  );
  return result.rows.length > 0;
};

const checkLimit: RateLimitCheck = async (identifier) => {
  const { checkRateLimit } = await import("./lib/rate-limit");
  return checkRateLimit(identifier);
};

export const requireSession =
  (getSession: SessionResolver = resolveSession): MiddlewareHandler =>
  async (c, next) => {
    const user = c.get("user") as User | undefined;
    const session = user ? null : await getSession(c.req.raw.headers);
    if (!user && !session) {
      throw new ApiError(401, "Inicia sesión para continuar.", { code: "unauthorized" });
    }

    c.set("user", user ?? session!.user);
    await next();
  };

export const requireMember =
  (communityId: string, hasMembership: MembershipLookup = lookupMembership): MiddlewareHandler =>
  async (c, next) => {
    const user = c.get("user") as User | undefined;
    if (!user) {
      throw new ApiError(401, "Inicia sesión para continuar.", { code: "unauthorized" });
    }
    if (!(await hasMembership(user.id, communityId))) {
      throw new ApiError(403, "No perteneces a esta comunidad.", {
        code: "community_membership_required",
      });
    }
    await next();
  };

export const rateLimitMiddleware =
  (
    limit: RateLimitCheck = checkLimit,
    getSession: SessionResolver = resolveSession,
    requireTrustedIp = env.NODE_ENV === "production",
  ): MiddlewareHandler =>
  async (c, next) => {
    const isWrite = ["POST", "PATCH", "DELETE"].includes(c.req.method);
    const isSensitiveRead = c.req.method === "GET" && c.req.path.startsWith("/api/auth/");
    if (!isWrite && !isSensitiveRead) return next();

    const user = c.get("user") as User | undefined;
    const clientIp = c.req.header("cf-connecting-ip");
    const enforceLimit = async (identifier: string) => {
      const result = await limit(identifier);
      if (result.success) return;
      c.header("Retry-After", String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))));
      logEvent("api.rate_limited", { method: c.req.method });
      throw new ApiError(429, "Demasiadas solicitudes. Inténtalo en un momento.", {
        code: "rate_limited",
      });
    };

    // shortcut: requests without a Cloudflare IP share a pre-auth bucket; production allows only authenticated users through.
    if (clientIp || !user) await enforceLimit(`ip:${clientIp ?? "unknown"}`);

    const sessionUser = user ?? (await getSession(c.req.raw.headers))?.user;
    if (!sessionUser && !clientIp && requireTrustedIp) {
      throw new ApiError(503, "No se pudo verificar la solicitud.", {
        code: "client_ip_unavailable",
      });
    }
    if (sessionUser) {
      c.set("user", sessionUser);
      await enforceLimit(`user:${sessionUser.id}`);
    }

    await next();
  };

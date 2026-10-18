import { joinWaitlistRoute, waitlistSummaryRoute } from "@andes-hack/api";
import type * as schema from "@andes-hack/db/schema/index";
import { waitlistEntry } from "@andes-hack/db/schema/waitlist";
import { OpenAPIHono } from "@hono/zod-openapi";
import { count } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { ApiError } from "./utils/api-response";
import { errorHandler, validationHook } from "./utils/error-handler";

export interface WaitlistDeps {
  // Any Postgres driver: Neon in production, PGlite in tests.
  db?: PgDatabase<PgQueryResultHKT, typeof schema>;
  limit?: (identifier: string) => Promise<{ success: boolean; reset: number }>;
}

// How many institutions and individuals are waiting; the panel (US-031) shows the same totals.
export async function waitlistTotals(db: NonNullable<WaitlistDeps["db"]>) {
  const totals = await db
    .select({ kind: waitlistEntry.kind, total: count() })
    .from(waitlistEntry)
    .groupBy(waitlistEntry.kind);
  // A list nobody has joined yet has no row of its own.
  const totalOf = (kind: "institution" | "individual") =>
    totals.find((row) => row.kind === kind)?.total ?? 0;
  return { institutions: totalOf("institution"), individuals: totalOf("individual") };
}

const thanks = "¡Gracias! Te escribiremos para coordinar.";

// The public waitlist (US-033), as its own app so it can be tested with a database and a
// rate limiter of its own.
export function createWaitlistRoutes(deps: WaitlistDeps = {}) {
  const app = new OpenAPIHono({ defaultHook: validationHook });
  app.onError(errorHandler);

  const getDb = async () => deps.db ?? (await import("@andes-hack/db")).db;
  const limit =
    deps.limit ??
    (async (identifier: string) => {
      const { checkWaitlistRateLimit } = await import("./lib/waitlist-rate-limit");
      return checkWaitlistRateLimit(identifier);
    });

  app.openapi(joinWaitlistRoute, async (c) => {
    const allowed = await limit(`waitlist:${c.req.header("cf-connecting-ip") ?? "unknown"}`);
    if (!allowed.success) {
      c.header("Retry-After", String(Math.max(1, Math.ceil((allowed.reset - Date.now()) / 1000))));
      throw new ApiError(429, "Inténtalo en unos minutos.", { code: "too_many_waitlist_entries" });
    }

    const { website, ...entry } = c.req.valid("json");
    // A filled trap field means a bot: it gets the same answer, so it learns nothing.
    if (website) return c.json({ message: thanks }, 201);

    const db = await getDb();
    const stored = await db
      .insert(waitlistEntry)
      .values({ ...entry, email: entry.email.toLowerCase() })
      .onConflictDoNothing()
      .returning({ id: waitlistEntry.id });
    if (stored.length === 0) {
      throw new ApiError(409, "Ya estás en la lista.", { code: "already_on_waitlist" });
    }
    return c.json({ message: thanks }, 201);
  });

  app.openapi(waitlistSummaryRoute, async (c) => {
    return c.json(await waitlistTotals(await getDb()), 200);
  });

  return app;
}

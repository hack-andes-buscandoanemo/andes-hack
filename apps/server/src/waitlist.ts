import { joinWaitlistRoute, waitlistSummaryRoute } from "@andes-hack/api";
import type * as schema from "@andes-hack/db/schema/index";
import { waitlistEntry } from "@andes-hack/db/schema/waitlist";
import { OpenAPIHono } from "@hono/zod-openapi";
import { count, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { errorHandler, validationHook } from "./utils/error-handler";

export interface WaitlistDeps {
  // Any Postgres driver: Neon in production, PGlite in tests.
  db?: PgDatabase<PgQueryResultHKT, typeof schema>;
  limit?: (identifier: string) => Promise<{ success: boolean; reset: number }>;
}

const thanks = "¡Gracias! Te escribiremos para coordinar.";

// The public waitlist (US-033), as its own app so it can be tested with a database and a
// rate limiter of its own.
export function createWaitlistRoutes(deps: WaitlistDeps = {}) {
  const app = new OpenAPIHono({ defaultHook: validationHook });
  app.onError(errorHandler);

  const database = async () => deps.db ?? (await import("@andes-hack/db")).db;

  app.openapi(joinWaitlistRoute, async (c) => {
    const { website: _website, ...entry } = c.req.valid("json");
    const db = await database();
    await db.insert(waitlistEntry).values({ ...entry, email: entry.email.toLowerCase() });
    return c.json({ message: thanks }, 201);
  });

  app.openapi(waitlistSummaryRoute, async (c) => {
    const db = await database();
    const [institutions] = await db
      .select({ total: count() })
      .from(waitlistEntry)
      .where(eq(waitlistEntry.kind, "institution"));
    const [individuals] = await db
      .select({ total: count() })
      .from(waitlistEntry)
      .where(eq(waitlistEntry.kind, "individual"));
    return c.json(
      { institutions: institutions?.total ?? 0, individuals: individuals?.total ?? 0 },
      200,
    );
  });

  return app;
}

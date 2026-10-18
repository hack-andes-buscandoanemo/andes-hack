import { publicStatsRoute, type PublicStatsSchema } from "@andes-hack/api";
import type * as schema from "@andes-hack/db/schema/index";
import { community, communityMember } from "@andes-hack/db/schema/community";
import { tripOffer } from "@andes-hack/db/schema/trips";
import { measureImpact } from "@andes-hack/matching";
import { OpenAPIHono, type z } from "@hono/zod-openapi";
import { and, count, eq, isNull, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import {
  loadCommunityActivity,
  loadDistrictBreakdown,
  loadPublicComparison,
} from "./community-activity";
import { clientIp } from "./lib/client-ip";
import { logEvent } from "./lib/logger";
import { ApiError } from "./utils/api-response";
import { errorHandler, validationHook } from "./utils/error-handler";
import { waitlistTotals } from "./waitlist";

type PublicStats = z.infer<typeof PublicStatsSchema>;

export interface StatsCache {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

// One shared answer per community: the panel is the same for everyone who looks at it.
const CACHE_TTL_SECONDS = 30;

export interface PublicStatsDeps {
  // Any Postgres driver: Neon in production, PGlite in tests.
  db?: PgDatabase<PgQueryResultHKT, typeof schema>;
  now?: () => Date;
  // Redis at the boundary: Upstash in production, a fake with its own clock in tests.
  cache?: StatsCache;
  limit?: (identifier: string) => Promise<{ success: boolean; reset: number }>;
}

// The public impact panel (US-031), as its own app so it can be tested with a database, a
// clock and a rate limiter of its own.
export function createPublicStatsRoutes(deps: PublicStatsDeps = {}) {
  const app = new OpenAPIHono({ defaultHook: validationHook });
  app.onError(errorHandler);

  const getDb = async () => deps.db ?? (await import("@andes-hack/db")).db;
  const getNow = deps.now ?? (() => new Date());
  const cache =
    deps.cache ??
    ({
      async get(key) {
        return (await import("./lib/public-stats-cache")).upstashStatsCache.get(key);
      },
      async set(key, value, ttlSeconds) {
        await (
          await import("./lib/public-stats-cache")
        ).upstashStatsCache.set(key, value, ttlSeconds);
      },
    } satisfies StatsCache);
  const limit =
    deps.limit ??
    (async (identifier: string) => {
      const { checkPublicStatsRateLimit } = await import("./lib/public-stats-rate-limit");
      return checkPublicStatsRateLimit(identifier);
    });

  app.openapi(publicStatsRoute, async (c) => {
    const ip = clientIp(c);
    const allowed = ip ? await limit(`public-stats:${ip}`) : { success: true, reset: 0 };
    if (!allowed.success) {
      c.header(
        "Retry-After",
        String(Math.max(1, Math.ceil((allowed.reset - getNow().getTime()) / 1000))),
      );
      throw new ApiError(429, "Demasiadas consultas. Inténtalo en un momento.", {
        code: "too_many_public_stats_requests",
      });
    }

    const { slug } = c.req.valid("param");
    const cacheKey = `andes-hack:public-stats:${slug}`;
    const cached = await cache.get(cacheKey).catch(() => {
      logEvent("public_stats_cache_unavailable", { operation: "get" });
      return null;
    });
    if (cached) return c.json(cached as PublicStats, 200);

    const db = await getDb();
    const [org] = await db.select().from(community).where(eq(community.slug, slug)).limit(1);
    if (!org) throw new ApiError(404, "Comunidad no encontrada.", { code: "community_not_found" });
    const members = await db
      .select({ travelRole: communityMember.travelRole })
      .from(communityMember)
      .where(and(eq(communityMember.communityId, org.id), eq(communityMember.isTeam, false)));
    const [offerCount] = await db
      .select({ activeOffers: count() })
      .from(tripOffer)
      .leftJoin(
        communityMember,
        and(
          eq(communityMember.communityId, tripOffer.communityId),
          eq(communityMember.userId, tripOffer.driverId),
        ),
      )
      .where(
        and(
          eq(tripOffer.communityId, org.id),
          eq(tripOffer.status, "active"),
          or(isNull(communityMember.isTeam), eq(communityMember.isTeam, false)),
        ),
      );
    const activity = await loadCommunityActivity(db, org, getNow());
    const impact = measureImpact(activity);
    const completedTrips = activity.offers
      .filter((offer) => !offer.driverIsTeam)
      .flatMap((offer) => offer.seats)
      .filter((seat) => seat.status === "completed" && !seat.passengerIsTeam).length;
    const stats = {
      community: { name: org.name, isDemo: org.isDemo },
      // The moment the figures were computed: a cached answer keeps its own time.
      updatedAt: getNow().toISOString(),
      activity: {
        enrolled: members.length,
        drivers: members.filter(
          ({ travelRole }) => travelRole === "driver" || travelRole === "both",
        ).length,
        activeOffers: offerCount?.activeOffers ?? 0,
        openNeeds: activity.openNeeds.filter((need) => !need.passengerIsTeam).length,
        coverage: impact.coverage,
        acceptedRequests: impact.peopleTransported,
        completedTrips,
      },
      waitlist: await waitlistTotals(db),
      comparison: await loadPublicComparison(db, org.id),
      districts: await loadDistrictBreakdown(db, org.id),
      people: {
        transported: impact.peopleTransported,
        fromPublicTransport: impact.fromPublicTransport,
      },
      vehicleImpact: {
        potential: impact.carTripsAvoided.potential,
        verified: impact.carTripsAvoided.verified,
        induced: impact.carTripsInduced,
        net: impact.netCarTripsAvoided,
      },
    };
    await cache.set(cacheKey, stats, CACHE_TTL_SECONDS).catch(() => {
      logEvent("public_stats_cache_unavailable", { operation: "set" });
    });
    return c.json(stats, 200);
  });

  return app;
}

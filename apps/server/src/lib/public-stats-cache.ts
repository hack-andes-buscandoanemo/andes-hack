import { Redis } from "@upstash/redis";

import type { StatsCache } from "../public-stats";

const redis = Redis.fromEnv();

// Upstash serialises objects to JSON on its own, so a cached answer comes back as an object.
export const upstashStatsCache: StatsCache = {
  get: (key) => redis.get(key),
  async set(key, value, ttlSeconds) {
    await redis.set(key, value, { ex: ttlSeconds });
  },
};

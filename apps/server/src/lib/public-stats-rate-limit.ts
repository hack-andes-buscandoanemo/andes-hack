import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// One panel polls every 30 s (2 per minute); 30 per minute per IP leaves room for a few
// tabs and refreshes while a script scraping the endpoint hits the wall.
export const publicStatsRateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(30, "60 s"),
  analytics: true,
  prefix: "andes-hack:public-stats",
});

export async function checkPublicStatsRateLimit(identifier: string) {
  return publicStatsRateLimit.limit(identifier);
}

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Someone opening a shared trip reloads it now and then; 60 per minute per IP is plenty for that
// and leaves nothing to a script trying tokens.
export const shareRateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(60, "60 s"),
  analytics: true,
  prefix: "andes-hack:share",
});

export async function checkShareRateLimit(identifier: string) {
  return shareRateLimit.limit(identifier);
}

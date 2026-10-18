import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Stricter than the general limit: a person signs up once, a bot keeps trying.
export const waitlistRateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "10 m"),
  analytics: true,
  prefix: "andes-hack:waitlist",
});

export async function checkWaitlistRateLimit(identifier: string) {
  return waitlistRateLimit.limit(identifier);
}

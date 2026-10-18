import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export const rateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(60, "60 s"),
  analytics: true,
  prefix: "andes-hack:ratelimit",
});

export const joinAttemptRateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "10 m"),
  analytics: true,
  prefix: "andes-hack:join-attempt",
});

export async function checkRateLimit(identifier: string) {
  return rateLimit.limit(identifier);
}

export async function checkJoinAttemptRateLimit(identifier: string) {
  return joinAttemptRateLimit.limit(identifier);
}

import { Redis } from "@upstash/redis";

// One matching run per journey at a time (US-019). The key expires on its own, so a run
// that dies without releasing it blocks the journey for a bounded while only.
export interface JourneyLock {
  // True when this caller now holds the lock.
  acquire(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
}

export const JOURNEY_LOCK_SECONDS = 120;

export function createRedisJourneyLock(redis = Redis.fromEnv()): JourneyLock {
  return {
    async acquire(key) {
      // SET NX: only the first caller writes the key while it lives.
      const result = await redis.set(key, "1", { nx: true, ex: JOURNEY_LOCK_SECONDS });
      return result === "OK";
    },
    async release(key) {
      await redis.del(key);
    },
  };
}

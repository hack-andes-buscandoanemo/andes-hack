import { Redis } from "@upstash/redis";

// One matching run per journey at a time (US-019). The key expires on its own, so a run
// that dies without releasing it blocks the journey for a bounded while only.
export interface JourneyLock {
  // A token when this caller now holds the lock; null when someone else does.
  acquire(key: string): Promise<string | null>;
  // Only the holder's token releases the key: a run that outlived the expiry must not
  // free the lock the next run took.
  release(key: string, token: string): Promise<void>;
}

const lockSeconds = 120;

// Deletes the key only while it still holds this token.
const releaseIfOwner =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0";

export function createRedisJourneyLock(redis = Redis.fromEnv()): JourneyLock {
  return {
    async acquire(key) {
      const token = crypto.randomUUID();
      // SET NX: only the first caller writes the key while it lives.
      const result = await redis.set(key, token, { nx: true, ex: lockSeconds });
      return result === "OK" ? token : null;
    },
    async release(key, token) {
      await redis.eval(releaseIfOwner, [key], [token]);
    },
  };
}

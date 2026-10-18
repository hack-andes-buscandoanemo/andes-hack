import { logEvent } from "./logger";

export type Limiter = (identifier: string) => Promise<{ success: boolean; reset: number }>;

// Redis down must not take a public route down: without a verdict the request goes through
// (fail open, a documented tradeoff). The log names the limiter ("public-stats"), never the
// key, which carries the client address.
export async function safeLimit(limiter: Limiter, key: string) {
  try {
    return await limiter(key);
  } catch {
    logEvent("rate_limit_unavailable", { limiter: key.split(":")[0] });
    return { success: true, reset: 0 };
  }
}

import type { Context } from "hono";

// Who is asking, for rate limiting. Behind Cloudflare `cf-connecting-ip` is always present and
// cannot be forged by the client. `x-real-ip` is the next best, set by a trusted proxy.
// `x-forwarded-for` is client-writable when nothing strips it, so it is only read outside
// production (local proxies, previews). With no honest key the caller skips the limit instead
// of putting everyone in one bucket (fail open, a documented tradeoff).
export function clientIp(
  c: Context,
  { production = process.env.NODE_ENV === "production" }: { production?: boolean } = {},
): string | null {
  const trusted = c.req.header("cf-connecting-ip")?.trim() || c.req.header("x-real-ip")?.trim();
  if (trusted) return trusted;
  if (production) return null;
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

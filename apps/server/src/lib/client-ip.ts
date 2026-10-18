import type { Context } from "hono";

// Who is asking, for rate limiting. Cloudflare's header cannot be forged behind Cloudflare;
// the proxy headers are the fallback for other hosts and local runs. With none of them there is
// no honest key, so the caller skips the limit instead of putting everyone in one bucket.
export function clientIp(c: Context): string | null {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    c.req.header("cf-connecting-ip")?.trim() ||
    forwarded ||
    c.req.header("x-real-ip")?.trim() ||
    null
  );
}

import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { clientIp } from "./client-ip";

async function ask(headers: Record<string, string>, production: boolean) {
  const app = new Hono().get("/", (c) => c.json({ ip: clientIp(c, { production }) }));
  const response = await app.request("/", { headers });
  return (await response.json()) as { ip: string | null };
}

describe("clientIp", () => {
  it("trusts Cloudflare's header first, in production and outside it", async () => {
    const headers = { "cf-connecting-ip": "203.0.113.7", "x-real-ip": "198.51.100.9" };

    expect(await ask(headers, true)).toEqual({ ip: "203.0.113.7" });
    expect(await ask(headers, false)).toEqual({ ip: "203.0.113.7" });
  });

  it("falls back to x-real-ip when Cloudflare's header is missing", async () => {
    expect(await ask({ "x-real-ip": "198.51.100.9" }, true)).toEqual({ ip: "198.51.100.9" });
  });

  it("ignores x-forwarded-for in production, where a client can write anything in it", async () => {
    expect(await ask({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" }, true)).toEqual({ ip: null });
  });

  it("reads the first x-forwarded-for entry outside production, for local proxies", async () => {
    expect(await ask({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" }, false)).toEqual({
      ip: "198.51.100.4",
    });
  });

  it("has no address when no header says one", async () => {
    expect(await ask({}, true)).toEqual({ ip: null });
  });
});

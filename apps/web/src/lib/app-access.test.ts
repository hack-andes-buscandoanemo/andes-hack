import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: { getSession: (...args: unknown[]) => getSession(...args) },
}));

import { resolveAppAccess } from "./app-access";

const SERVER_URL = "https://api.test";
const fetchMock = vi.fn();

function meResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const ana = { id: "u1", name: "Ana", email: "ana@uni.pe" };
const readyMembership = {
  communityId: "c-1",
  communityName: "Universidad Nacional",
  role: "admin",
  consentAt: "2026-10-01T10:00:00Z",
  usualMode: "drove_alone",
  travelRole: "both",
  alias: "Ana R.",
  verificationMethod: "email_domain",
  identifiesAsWoman: true,
  womenOnly: false,
};

beforeEach(() => {
  getSession.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  getSession.mockResolvedValue({ user: ana });
});

afterEach(() => vi.unstubAllGlobals());

const access = () =>
  resolveAppAccess({ headers: new Headers({ cookie: "s=1" }), serverUrl: SERVER_URL });

describe("app route protection", () => {
  it("sends visitors without a session to the welcome screen", async () => {
    getSession.mockResolvedValue(null);

    expect(await access()).toEqual({ redirectTo: "/" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends members without a community to /ingresar", async () => {
    fetchMock.mockReturnValue(meResponse({ user: ana, memberships: [] }));

    expect(await access()).toEqual({ redirectTo: "/ingresar" });
  });

  it("sends members who skipped the consent or usual travel mode to /comenzar", async () => {
    fetchMock.mockReturnValue(
      meResponse({ user: ana, memberships: [{ ...readyMembership, consentAt: null }] }),
    );
    expect(await access()).toEqual({ redirectTo: "/comenzar" });

    fetchMock.mockReturnValue(
      meResponse({ user: ana, memberships: [{ ...readyMembership, usualMode: null }] }),
    );
    expect(await access()).toEqual({ redirectTo: "/comenzar" });
  });

  it("lets onboarded members in and exposes their community, role, profile and travel preferences", async () => {
    fetchMock.mockReturnValue(meResponse({ user: ana, memberships: [readyMembership] }));

    expect(await access()).toEqual({
      user: { name: "Ana", email: "ana@uni.pe" },
      communityId: "c-1",
      communityName: "Universidad Nacional",
      role: "admin",
      preferences: { communityId: "c-1", identifiesAsWoman: true, womenOnly: false },
      membership: {
        communityId: "c-1",
        communityName: "Universidad Nacional",
        alias: "Ana R.",
        verificationMethod: "email_domain",
        usualMode: "drove_alone",
        travelRole: "both",
      },
    });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.test/me");
    expect(new Headers(fetchMock.mock.calls[0]![1].headers).get("cookie")).toBe("s=1");
  });

  it("fails closed when /me returns 404", async () => {
    fetchMock.mockReturnValue(meResponse({}, 404));

    expect(await access()).toEqual({ unavailable: true });
  });

  it("fails closed when /me answers with a server error", async () => {
    fetchMock.mockReturnValue(meResponse({}, 503));

    expect(await access()).toEqual({ unavailable: true });
  });

  it("fails closed when the network drops", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    expect(await access()).toEqual({ unavailable: true });
  });

  it("asks /me for fresh data on every request", async () => {
    fetchMock.mockReturnValue(meResponse({ user: ana, memberships: [readyMembership] }));
    await access();

    expect(fetchMock.mock.calls[0]![1].cache).toBe("no-store");
  });

  it("fails closed when the auth server is down", async () => {
    getSession.mockRejectedValue(new Error("auth down"));

    expect(await access()).toEqual({ unavailable: true });
  });

  it("sends the visitor to the welcome screen when /me rejects the session (401)", async () => {
    fetchMock.mockReturnValue(meResponse({}, 401));

    expect(await access()).toEqual({ redirectTo: "/" });
  });
});

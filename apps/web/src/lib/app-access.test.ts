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
  communityName: "Universidad Nacional",
  consentAt: "2026-10-01T10:00:00Z",
  usualMode: "drive_alone",
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

  it("sends members who skipped the consent to /comenzar", async () => {
    fetchMock.mockReturnValue(
      meResponse({ user: ana, memberships: [{ ...readyMembership, consentAt: null }] }),
    );

    expect(await access()).toEqual({ redirectTo: "/comenzar" });
  });

  it("lets onboarded members in and exposes their community", async () => {
    fetchMock.mockReturnValue(meResponse({ user: ana, memberships: [readyMembership] }));

    expect(await access()).toEqual({
      user: { name: "Ana", email: "ana@uni.pe" },
      communityName: "Universidad Nacional",
    });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.test/me");
    expect(new Headers(fetchMock.mock.calls[0]![1].headers).get("cookie")).toBe("s=1");
  });

  it("falls back to the session while /me is not deployed (404)", async () => {
    fetchMock.mockReturnValue(meResponse({}, 404));

    expect(await access()).toEqual({ user: { name: "Ana", email: "ana@uni.pe" } });
  });

  it("does not crash when /me fails with a server error or the network drops", async () => {
    fetchMock.mockReturnValueOnce(meResponse({}, 503));
    expect(await access()).toEqual({ user: { name: "Ana", email: "ana@uni.pe" } });

    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await access()).toEqual({ user: { name: "Ana", email: "ana@uni.pe" } });
  });

  it("sends the visitor to the welcome screen when /me rejects the session (401)", async () => {
    fetchMock.mockReturnValue(meResponse({}, 401));

    expect(await access()).toEqual({ redirectTo: "/" });
  });
});

import { expect, it } from "vitest";

import { runSmokeFlow } from "./smoke-flow";

const communityId = "11111111-1111-4111-8111-111111111111";
const vehicleId = "22222222-2222-4222-8222-222222222222";
const offerId = "33333333-3333-4333-8333-333333333333";
const bookingId = "44444444-4444-4444-8444-444444444444";
const driverEmail = "smoke-driver@example.test";
const passengerEmail = "smoke-passenger@example.test";
const smokeConfig = {
  baseUrl: "https://api.example.test",
  driverEmail,
  passengerEmail,
  password: "smoke-password",
  joinCode: "demo-join-code",
  teamEmails: `${driverEmail},${passengerEmail}`,
};

it("runs the critical flow with separate session cookies and cleans up its booking and offer", async () => {
  const requests: Array<{ path: string; cookie: string | null; body: unknown }> = [];
  const output: string[] = [];
  let existingAccounts = false;
  let hasVehicle = false;
  let failAcceptance = false;
  const fetcher: NonNullable<Parameters<typeof runSmokeFlow>[1]>["fetch"] = async (input, init) => {
    const url = new URL(input.toString());
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const cookie = new Headers(init?.headers).get("cookie");
    requests.push({ path: `${method} ${url.pathname}`, cookie, body });

    if (url.pathname === "/api/auth/sign-in/email") {
      if (existingAccounts) {
        const token = body.email === driverEmail ? "driver-session" : "passenger-session";
        return Response.json(
          {},
          { headers: { "set-cookie": `better-auth.session_token=${token}; Path=/; HttpOnly` } },
        );
      }
      return Response.json({ message: "Invalid email or password" }, { status: 401 });
    }
    if (url.pathname === "/api/auth/sign-up/email") {
      const token = body.email === driverEmail ? "driver-session" : "passenger-session";
      const headers = new Headers();
      headers.append("set-cookie", `better-auth.session_token=${token}; Path=/; HttpOnly`);
      headers.append("set-cookie", `better-auth.csrf_token=${token}-csrf; Path=/; Secure`);
      return Response.json({ user: { id: token } }, { headers });
    }
    if (url.pathname === "/communities") {
      return Response.json({ communities: [{ id: communityId, slug: "demo", isDemo: true }] });
    }
    if (url.pathname === `/communities/${communityId}/join`) {
      return Response.json({ isTeam: true });
    }
    if (url.pathname === `/communities/${communityId}/membership`) {
      return Response.json({});
    }
    if (url.pathname === `/communities/${communityId}/zones`) {
      return Response.json({ zones: [{ id: "zone-1", name: "Miraflores" }] });
    }
    if (url.pathname === "/vehicles" && method === "GET") {
      return Response.json({ vehicles: hasVehicle ? [{ id: vehicleId, seats: 4 }] : [] });
    }
    if (url.pathname === "/vehicles" && method === "POST") {
      hasVehicle = true;
      return Response.json({ id: vehicleId }, { status: 201 });
    }
    if (url.pathname === `/communities/${communityId}/offers`) {
      return Response.json({ offer: { id: offerId } }, { status: 201 });
    }
    if (url.pathname === `/communities/${communityId}/search`) {
      return Response.json({ matches: [{ offerId }] });
    }
    if (url.pathname === `/offers/${offerId}/bookings`) {
      return Response.json({ booking: { id: bookingId } }, { status: 201 });
    }
    if (url.pathname === `/bookings/${bookingId}/accept`) {
      if (failAcceptance) {
        return Response.json(
          { error: `acceptance unavailable for ${driverEmail}; join=demo-join-code` },
          { status: 503 },
        );
      }
      return Response.json({ booking: { id: bookingId, status: "accepted" } });
    }
    if (url.pathname === `/public/communities/demo/stats`) {
      return Response.json({
        community: { name: "Demo", isDemo: true },
        updatedAt: new Date().toISOString(),
        activity: {
          enrolled: 0,
          drivers: 0,
          activeOffers: 0,
          openNeeds: 0,
          coverage: null,
          acceptedRequests: 0,
          completedTrips: 0,
          incidentReports: 0,
        },
        waitlist: { institutions: 0, individuals: 0 },
        comparison: null,
        districts: [],
        people: { transported: 0, fromPublicTransport: 0 },
        vehicleImpact: {
          potential: { trips: 0, km: 0, co2Kg: 0 },
          verified: { trips: 0, km: 0, co2Kg: 0 },
          induced: 0,
          net: 0,
        },
      });
    }
    if (
      url.pathname === `/bookings/${bookingId}/cancel` ||
      url.pathname === `/offers/${offerId}/cancel`
    ) {
      return Response.json({});
    }
    throw new Error(`Unexpected request: ${method} ${url.pathname}`);
  };

  await runSmokeFlow(smokeConfig, { fetch: fetcher, report: (line) => output.push(line) });

  const driverRequests = requests.filter(({ cookie }) => cookie?.includes("driver-session"));
  const passengerRequests = requests.filter(({ cookie }) => cookie?.includes("passenger-session"));
  expect(
    driverRequests.some(({ path }) => path === `POST /communities/${communityId}/offers`),
  ).toBe(true);
  expect(
    passengerRequests.some(({ path }) => path === `POST /communities/${communityId}/search`),
  ).toBe(true);
  expect(driverRequests.every(({ cookie }) => !cookie?.includes("passenger-session"))).toBe(true);
  expect(passengerRequests.every(({ cookie }) => !cookie?.includes("driver-session"))).toBe(true);
  expect(
    driverRequests.some(({ cookie }) =>
      cookie?.includes("better-auth.csrf_token=driver-session-csrf"),
    ),
  ).toBe(true);
  expect(
    requests.some(
      ({ path, cookie }) =>
        path === `POST /bookings/${bookingId}/cancel` && cookie?.includes("passenger-session"),
    ),
  ).toBe(true);
  expect(requests.some(({ path }) => path === `POST /offers/${offerId}/cancel`)).toBe(true);
  expect(requests.some(({ path }) => path === "POST /vehicles")).toBe(true);
  expect(
    requests.some(
      ({ path, cookie }) => path === "GET /public/communities/demo/stats" && cookie === null,
    ),
  ).toBe(true);
  expect(output.at(-1)).toMatch(/\d+\/\d+ steps passed/);

  existingAccounts = true;
  failAcceptance = true;
  const failedOutput: string[] = [];
  const signupsBefore = requests.filter(
    ({ path }) => path === "POST /api/auth/sign-up/email",
  ).length;
  await expect(
    runSmokeFlow(smokeConfig, { fetch: fetcher, report: (line) => failedOutput.push(line) }),
  ).rejects.toThrow("HTTP 503");
  expect(requests.filter(({ path }) => path === "POST /api/auth/sign-up/email")).toHaveLength(
    signupsBefore,
  );
  expect(
    failedOutput.some(
      (line) =>
        line.includes("FAIL accept seat request") &&
        line.includes("status=503") &&
        line.includes("acceptance unavailable") &&
        line.includes("[redacted]") &&
        !line.includes(driverEmail) &&
        !line.includes("demo-join-code"),
    ),
  ).toBe(true);
  expect(
    requests.some(
      ({ path, cookie }) =>
        path === `POST /bookings/${bookingId}/cancel` && cookie?.includes("passenger-session"),
    ),
  ).toBe(true);
  expect(
    requests.some(
      ({ path, cookie }) =>
        path === `POST /offers/${offerId}/cancel` && cookie?.includes("driver-session"),
    ),
  ).toBe(true);
});

it("refuses smoke accounts missing from TEAM_EMAILS before making an HTTP request", async () => {
  let requestCount = 0;
  await expect(
    runSmokeFlow(
      { ...smokeConfig, teamEmails: driverEmail },
      {
        fetch: async () => {
          requestCount += 1;
          return Response.json({});
        },
        report: () => {},
      },
    ),
  ).rejects.toThrow("must both be listed in TEAM_EMAILS");
  expect(requestCount).toBe(0);
});

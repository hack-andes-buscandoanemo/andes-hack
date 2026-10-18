import { PublicStatsSchema } from "@andes-hack/api";

type SmokeConfig = {
  baseUrl: string;
  driverEmail: string;
  passengerEmail: string;
  password: string;
  joinCode: string;
  teamEmails: string;
};

type SmokeDependencies = {
  fetch?: (
    input: URL,
    init: { method: string; headers: Headers; body?: string },
  ) => Promise<Response>;
  report?: (line: string) => void;
};

type ApiResponse = { status: number; body: unknown; text: string };

class SmokeHttpError extends Error {
  constructor(
    readonly status: number | null,
    readonly body: string,
    message: string,
  ) {
    super(message);
    this.name = "SmokeHttpError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redact(text: string, config: SmokeConfig): string {
  return [config.driverEmail, config.passengerEmail, config.password, config.joinCode].reduce(
    (result, secret) =>
      secret
        ? result.replace(
            new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
            "[redacted]",
          )
        : result,
    text,
  );
}

function tomorrowInLima(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export async function runSmokeFlow(config: SmokeConfig, dependencies: SmokeDependencies = {}) {
  const teamEmails = new Set(
    config.teamEmails.split(",").map((email) => email.trim().toLowerCase()),
  );
  if (
    !teamEmails.has(config.driverEmail.trim().toLowerCase()) ||
    !teamEmails.has(config.passengerEmail.trim().toLowerCase())
  ) {
    throw new Error(
      "SMOKE_DRIVER_EMAIL and SMOKE_PASSENGER_EMAIL must both be listed in TEAM_EMAILS.",
    );
  }
  if (config.driverEmail.trim().toLowerCase() === config.passengerEmail.trim().toLowerCase()) {
    throw new Error("Smoke driver and passenger must use different email addresses.");
  }

  const baseUrl = new URL(config.baseUrl);
  const fetcher = dependencies.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const report = dependencies.report ?? console.log;
  const startedAt = performance.now();
  let passed = 0;
  let total = 0;
  let flowError: unknown;
  let cleanupError: unknown;
  let bookingId: string | undefined;
  let offerId: string | undefined;
  let demoId: string | undefined;
  let demoSlug: string | undefined;

  const step = async <T>(name: string, action: () => Promise<T>): Promise<T> => {
    total += 1;
    const started = performance.now();
    try {
      const value = await action();
      passed += 1;
      report(`PASS ${name} (${Math.round(performance.now() - started)} ms)`);
      return value;
    } catch (error) {
      const status = error instanceof SmokeHttpError ? (error.status ?? "n/a") : "n/a";
      const body =
        error instanceof SmokeHttpError
          ? error.body
          : error instanceof Error
            ? error.message
            : String(error);
      report(
        `FAIL ${name} (${Math.round(performance.now() - started)} ms) status=${status} body=${body.replace(/\s+/g, " ").slice(0, 1000)}`,
      );
      throw error;
    }
  };

  const client = () => {
    const cookies = new Map<string, string>();
    return {
      async request(
        path: string,
        options: { method?: string; body?: unknown } = {},
      ): Promise<ApiResponse> {
        const headers = new Headers({ accept: "application/json" });
        if (options.body !== undefined) headers.set("content-type", "application/json");
        if (cookies.size) {
          headers.set("cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "));
        }

        let response: Response;
        try {
          response = await fetcher(new URL(path, baseUrl), {
            method: options.method ?? "GET",
            headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
          });
        } catch (error) {
          throw new SmokeHttpError(
            null,
            error instanceof Error ? error.message : String(error),
            "Request failed.",
          );
        }

        const responseHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
        const setCookies = responseHeaders.getSetCookie?.() ?? [
          response.headers.get("set-cookie") ?? "",
        ];
        for (const setCookie of setCookies) {
          const pair = setCookie.split(";", 1)[0] ?? "";
          const separator = pair.indexOf("=");
          if (separator < 1) continue;
          const name = pair.slice(0, separator).trim();
          const value = pair.slice(separator + 1).trim();
          if (/max-age=0/i.test(setCookie) || /expires=Thu, 01 Jan 1970/i.test(setCookie)) {
            cookies.delete(name);
          } else {
            cookies.set(name, value);
          }
        }

        const text = await response.text();
        let body: unknown = text;
        if (text) {
          try {
            body = JSON.parse(text);
          } catch {
            // Keep a non-JSON response body available in the failure report.
          }
        }
        const result = { status: response.status, body, text };
        if (!response.ok) {
          throw new SmokeHttpError(
            response.status,
            redact(text || "(empty response body)", config)
              .replace(/\s+/g, " ")
              .slice(0, 1000),
            `HTTP ${response.status}`,
          );
        }
        return result;
      },
      hasSession() {
        return [...cookies.keys()].some((name) => name.endsWith("session_token"));
      },
    };
  };
  const driver = client();
  const passenger = client();
  const publicClient = client();

  const invalidResponse = (response: ApiResponse, message: string) =>
    new SmokeHttpError(
      response.status,
      redact(response.text || "(empty response body)", config)
        .replace(/\s+/g, " ")
        .slice(0, 1000),
      message,
    );

  const requireRecord = (result: ApiResponse, value: unknown, description: string) => {
    if (!isRecord(value)) {
      throw invalidResponse(result, `Expected ${description}.`);
    }
    return value;
  };

  const authenticate = async (account: ReturnType<typeof client>, email: string, name: string) => {
    try {
      await account.request("/api/auth/sign-in/email", {
        method: "POST",
        body: { email, password: config.password },
      });
    } catch (error) {
      if (!(error instanceof SmokeHttpError) || error.status !== 401) throw error;
      await account.request("/api/auth/sign-up/email", {
        method: "POST",
        body: { email, password: config.password, name },
      });
    }
    if (!account.hasSession()) {
      throw new Error("Authentication succeeded without a session cookie.");
    }
  };

  const joinAndOnboard = async (
    account: ReturnType<typeof client>,
    communityId: string,
    role: "driver" | "passenger",
  ) => {
    const joined = await account.request(`/communities/${communityId}/join`, {
      method: "POST",
      body: { code: config.joinCode },
    });
    if (requireRecord(joined, joined.body, "a community membership response").isTeam !== true) {
      throw invalidResponse(joined, "The smoke account is not marked as a team member.");
    }
    await account.request(`/communities/${communityId}/membership`, {
      method: "PATCH",
      body: { usualMode: "public_transport", travelRole: role, consentAccepted: true },
    });
  };

  try {
    const tripDate = tomorrowInLima();

    await step("authenticate driver", () =>
      authenticate(driver, config.driverEmail, "Smoke Driver"),
    );
    await step("authenticate passenger", () =>
      authenticate(passenger, config.passengerEmail, "Smoke Passenger"),
    );

    const demo = await step("find demo community", async () => {
      const communities = await driver.request("/communities");
      const communityList = requireRecord(
        communities,
        communities.body,
        "the communities response",
      ).communities;
      if (!Array.isArray(communityList)) {
        throw invalidResponse(communities, "The communities response is invalid.");
      }
      const result = communityList.find(
        (community) => isRecord(community) && community.isDemo === true,
      );
      if (!isRecord(result) || typeof result.id !== "string" || typeof result.slug !== "string") {
        throw invalidResponse(communities, "No demo community is available.");
      }
      return { id: result.id, slug: result.slug };
    });
    demoId = demo.id;
    demoSlug = demo.slug;

    await step("join and onboard driver", () => joinAndOnboard(driver, demoId!, "driver"));
    await step("join and onboard passenger", () => joinAndOnboard(passenger, demoId!, "passenger"));

    const originZoneId = await step("load demo zones", async () => {
      const zones = await driver.request(`/communities/${demoId}/zones`);
      const zoneList = requireRecord(zones, zones.body, "the zones response").zones;
      if (
        !Array.isArray(zoneList) ||
        !isRecord(zoneList[0]) ||
        typeof zoneList[0].id !== "string"
      ) {
        throw invalidResponse(zones, "The demo community has no usable zones.");
      }
      return zoneList[0].id;
    });

    const vehicles = await step("load driver vehicle", async () => {
      const response = await driver.request("/vehicles");
      const vehicleList = requireRecord(response, response.body, "the vehicles response").vehicles;
      if (!Array.isArray(vehicleList)) {
        throw invalidResponse(response, "The vehicles response is invalid.");
      }
      return vehicleList.find(
        (candidate) =>
          isRecord(candidate) && typeof candidate.id === "string" && Number(candidate.seats) >= 1,
      )?.id as string | undefined;
    });
    let vehicleId = vehicles;
    if (!vehicleId) {
      vehicleId = await step("register smoke vehicle", async () => {
        const createdVehicle = await driver.request("/vehicles", {
          method: "POST",
          body: { plate: "SMK-006", makeModel: "Vehículo de prueba", color: "Gris", seats: 4 },
        });
        const vehicle = requireRecord(createdVehicle, createdVehicle.body, "the created vehicle");
        if (typeof vehicle.id !== "string") {
          throw invalidResponse(createdVehicle, "The created vehicle has no ID.");
        }
        return vehicle.id;
      });
    }

    offerId = await step("offer trip", async () => {
      const createdOffer = await driver.request(`/communities/${demoId}/offers`, {
        method: "POST",
        body: {
          vehicleId,
          direction: "outbound",
          originZoneId,
          departureTime: "10:00",
          date: tripDate,
          seatsTotal: 1,
          maxDetourMinutes: 5,
          womenOnly: false,
        },
      });
      const offer = requireRecord(createdOffer, createdOffer.body, "the created offer").offer;
      if (!isRecord(offer) || typeof offer.id !== "string") {
        throw invalidResponse(createdOffer, "The created offer has no ID.");
      }
      return offer.id;
    });

    await step("search for offered trip", async () => {
      const search = await passenger.request(`/communities/${demoId}/search`, {
        method: "POST",
        body: {
          direction: "outbound",
          originZoneId,
          windowStart: "09:30",
          windowEnd: "10:30",
          date: tripDate,
          maxWalkMinutes: 15,
          fallbackMode: "public_transport",
        },
      });
      const matches = requireRecord(search, search.body, "the search response").matches;
      if (
        !Array.isArray(matches) ||
        !matches.some((match) => isRecord(match) && match.offerId === offerId)
      ) {
        throw invalidResponse(search, "The new offer did not appear in passenger search.");
      }
    });

    await step("request seat", async () => {
      const response = await passenger.request(`/offers/${offerId}/bookings`, {
        method: "POST",
        body: { message: "Smoke flow validation." },
      });
      const value = requireRecord(response, response.body, "the booking response").booking;
      if (!isRecord(value) || typeof value.id !== "string") {
        throw invalidResponse(response, "The booking response has no ID.");
      }
      bookingId = value.id;
    });

    await step("accept seat request", async () => {
      const response = await driver.request(`/bookings/${bookingId}/accept`, { method: "POST" });
      const accepted = requireRecord(response, response.body, "the acceptance response").booking;
      if (!isRecord(accepted) || accepted.status !== "accepted") {
        throw invalidResponse(response, "The seat request was not accepted.");
      }
    });

    await step("validate public impact stats", async () => {
      const stats = await publicClient.request(`/public/communities/${demoSlug}/stats`);
      const parsedStats = PublicStatsSchema.safeParse(stats.body);
      if (!parsedStats.success) {
        throw invalidResponse(stats, "The public impact response does not match its schema.");
      }
    });
  } catch (error) {
    flowError = error;
  } finally {
    if (bookingId) {
      try {
        await step("cancel smoke booking", async () => {
          await passenger.request(`/bookings/${bookingId}/cancel`, { method: "POST" });
        });
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (offerId) {
      try {
        await step("cancel smoke offer", async () => {
          await driver.request(`/offers/${offerId}/cancel`, { method: "POST" });
        });
      } catch (error) {
        cleanupError ??= error;
      }
    }
  }

  report(
    `Smoke flow: ${passed}/${total} steps passed (${Math.round(performance.now() - startedAt)} ms)`,
  );
  if (flowError) throw flowError;
  if (cleanupError) throw cleanupError;
}

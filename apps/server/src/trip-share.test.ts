import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    BETTER_AUTH_SECRET: "vitest-secret-with-at-least-thirty-two-characters",
    BETTER_AUTH_URL: "http://localhost:3000",
    UPSTASH_REDIS_REST_URL: "https://example.com",
    UPSTASH_REDIS_REST_TOKEN: "vitest-token",
    CORS_ORIGIN: "http://localhost:3001",
    TEAM_EMAILS: "equipo@tejalo.pe",
    NODE_ENV: "test",
  });
});

import { user } from "@andes-hack/db/schema/auth";
import { community, communityMember } from "@andes-hack/db/schema/community";
import { meetingPoint, zone } from "@andes-hack/db/schema/places";
import { seatBooking, tripOffer, tripRequest, tripShareLink } from "@andes-hack/db/schema/trips";
import { vehicle } from "@andes-hack/db/schema/vehicle";
import { createTestDb } from "@andes-hack/db/test-db";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";

import { createApp, type AppDeps } from "./index";

let testDb: Awaited<ReturnType<typeof createTestDb>>["db"];
let closeDb: () => Promise<void>;

beforeAll(async () => {
  const instance = await createTestDb();
  testDb = instance.db;
  closeDb = instance.close;
});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  plateCounter = 123;
  await testDb.delete(seatBooking);
  await testDb.delete(tripRequest);
  await testDb.delete(tripOffer);
  await testDb.delete(vehicle);
  await testDb.delete(meetingPoint);
  await testDb.delete(communityMember);
  await testDb.delete(community);
  await testDb.delete(zone);
  await testDb.delete(user);
});

// 10:00 in Lima (UTC-5) on 2026-10-19.
const NOW = new Date("2026-10-19T15:00:00.000Z");
const TRIP_DAY = "2026-10-19";

async function seedWorld() {
  const [org] = await testDb
    .insert(community)
    .values({
      slug: "alfa",
      name: "Comunidad Alfa",
      kind: "company",
      destinationName: "Centro Empresarial Real",
      destinationLat: -12.0975459,
      destinationLng: -77.0375707,
      isDemo: true,
    })
    .returning();
  await testDb.insert(zone).values([
    { id: "la-molina", name: "La Molina", district: "La Molina", lat: -12.0853, lng: -76.9682 },
    { id: "san-borja", name: "San Borja", district: "San Borja", lat: -12.0897, lng: -77.0031 },
  ]);
  await testDb.insert(meetingPoint).values({
    id: "san-borja-estacion-san-borja-sur",
    zoneId: "san-borja",
    name: "Estación San Borja Sur (Línea 1)",
    kind: "rail_station",
    lat: -12.1004192,
    lng: -77.001846,
    source: "test",
  });
  return org!;
}

async function createMember(communityId: string, id: string, name: string, alias?: string) {
  const [person] = await testDb
    .insert(user)
    .values({ id, name, email: `${id}@alfa.pe` })
    .returning();
  await testDb.insert(communityMember).values({
    communityId,
    userId: id,
    verificationMethod: "join_code",
    consentVersion: "v1",
    consentAt: new Date("2026-10-18T12:00:00.000Z"),
    usualMode: "drove_alone",
    travelRole: "both",
    alias: alias ?? null,
  });
  return person!;
}

let plateCounter = 123;

async function createOffer(
  communityId: string,
  driverId: string,
  options: { date?: string; status?: "active" | "paused" | "cancelled" } = {},
) {
  const [car] = await testDb
    .insert(vehicle)
    .values({
      ownerId: driverId,
      plate: `ABC${plateCounter++}`,
      make: "Toyota",
      model: "Corolla",
      color: "Gris",
      seats: 4,
    })
    .returning();
  const [offer] = await testDb
    .insert(tripOffer)
    .values({
      communityId,
      driverId,
      vehicleId: car!.id,
      direction: "outbound",
      originZoneId: "la-molina",
      departureTime: "07:00",
      ...(options.date ? { date: options.date } : { daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }),
      seatsTotal: 3,
      maxDetourMinutes: 10,
      status: options.status ?? "active",
    })
    .returning();
  return offer!;
}

async function book(
  offer: { id: string; communityId: string },
  passengerId: string,
  options: {
    status?: "pending" | "accepted" | "rejected" | "cancelled_by_passenger" | "completed";
    startedAt?: Date;
    arrivedAt?: Date;
  } = {},
) {
  const [need] = await testDb
    .insert(tripRequest)
    .values({
      communityId: offer.communityId,
      passengerId,
      direction: "outbound",
      originZoneId: "san-borja",
      windowStart: "07:30",
      windowEnd: "08:00",
      daysOfWeek: [1, 2, 3],
      maxWalkMinutes: 15,
      fallbackMode: "taxi_app",
      status: "matched",
    })
    .returning();
  const [booking] = await testDb
    .insert(seatBooking)
    .values({
      offerId: offer.id,
      requestId: need!.id,
      passengerId,
      meetingPointId: "san-borja-estacion-san-borja-sur",
      pickupAt: "07:29",
      detourMinutes: 6,
      walkMinutes: 4,
      status: options.status ?? "accepted",
      startedAt: options.startedAt,
      arrivedAt: options.arrivedAt,
    })
    .returning();
  return booking!;
}

type Reply = { status: number; headers: Headers; json(): Promise<any> };

function appFor(person: { id: string } | null, deps: Partial<AppDeps> = {}) {
  return createApp({
    db: testDb as never,
    getSession: async () => (person ? ({ user: person } as never) : null),
    rateLimit: async () => ({ success: true, reset: 0 }),
    shareRateLimit: async () => ({ success: true, reset: 0 }),
    now: () => NOW,
    ...deps,
  });
}

async function shareAs(person: { id: string }, bookingId: string, deps: Partial<AppDeps> = {}) {
  return (await appFor(person, deps).request(`/bookings/${bookingId}/share-links`, {
    method: "POST",
  })) as unknown as Reply;
}

async function openLink(token: string, deps: Partial<AppDeps> = {}) {
  return (await appFor(null, deps).request(`/public/share/${token}`, {
    headers: { "cf-connecting-ip": "203.0.113.7" },
  })) as unknown as Reply;
}

async function world() {
  const org = await seedWorld();
  const driver = await createMember(org.id, "driver", "Carlos Quispe Huamán", "Carlos Q.");
  const passenger = await createMember(org.id, "passenger", "María Torres Rojas", "Mari T.");
  const offer = await createOffer(org.id, driver.id, { date: TRIP_DAY });
  const booking = await book(offer, passenger.id);
  return { org, driver, passenger, offer, booking };
}

describe("POST /bookings/{id}/share-links", () => {
  it("gives the passenger of an accepted trip a link that expires at the end of the trip day in Lima", async () => {
    const { passenger, booking } = await world();

    const reply = await shareAs(passenger, booking.id);

    expect(reply.status).toBe(201);
    const body = await reply.json();
    expect(body.expiresAt).toBe("2026-10-20T05:00:00.000Z");
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("GET /public/share/{token}", () => {
  it("shows the driver, the car with plate, the meeting point, the time and the status", async () => {
    const { passenger, booking } = await world();
    const { token } = await (await shareAs(passenger, booking.id)).json();

    const reply = await openLink(token);

    expect(reply.status).toBe(200);
    expect(await reply.json()).toEqual({
      passengerAlias: "Mari T.",
      driverAlias: "Carlos Q.",
      vehicle: { make: "Toyota", model: "Corolla", color: "Gris", plate: "ABC123" },
      meetingPointName: "Estación San Borja Sur (Línea 1)",
      estimatedTime: "07:29",
      status: "not_started",
    });
  });
});

const UNAVAILABLE = {
  error: "Este enlace ya no está disponible.",
  details: { code: "share_link_unavailable" },
};

describe("an unavailable link", () => {
  it("keeps only the SHA-256 of the token, so the table cannot open a link", async () => {
    const { passenger, booking } = await world();

    const { token, id } = await (await shareAs(passenger, booking.id)).json();

    const [stored] = await testDb.select().from(tripShareLink).where(eq(tripShareLink.id, id));
    expect(stored!.tokenHash).not.toBe(token);
    expect(stored!.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
  });

  it("answers the same for a token that never existed", async () => {
    await world();

    const reply = await openLink("A".repeat(43));

    expect(reply.status).toBe(404);
    expect(await reply.json()).toMatchObject(UNAVAILABLE);
  });

  it("stops working once the passenger stops sharing", async () => {
    const { passenger, booking } = await world();
    const { id, token } = await (await shareAs(passenger, booking.id)).json();

    const revoked = (await appFor(passenger).request(`/share-links/${id}`, {
      method: "DELETE",
    })) as unknown as Reply;
    const reply = await openLink(token);

    expect(revoked.status).toBe(200);
    expect(reply.status).toBe(404);
    expect(await reply.json()).toMatchObject(UNAVAILABLE);
  });

  it("stops working when the trip day is over in Lima", async () => {
    const { passenger, booking } = await world();
    const { token } = await (await shareAs(passenger, booking.id)).json();

    const justBefore = await openLink(token, { now: () => new Date("2026-10-20T04:59:59.000Z") });
    const justAfter = await openLink(token, { now: () => new Date("2026-10-20T05:00:00.000Z") });

    expect(justBefore.status).toBe(200);
    expect(justAfter.status).toBe(404);
    expect(await justAfter.json()).toMatchObject(UNAVAILABLE);
  });
});

describe("who can share", () => {
  it("is only the passenger of the booking; the driver and strangers get not found", async () => {
    const { org, driver, booking } = await world();
    const stranger = await createMember(org.id, "stranger", "Elena Vega");

    for (const person of [driver, stranger]) {
      const reply = await shareAs(person, booking.id);
      expect(reply.status).toBe(404);
      expect(await reply.json()).toMatchObject({
        error: "No encontramos esta reserva.",
        details: { code: "booking_not_found" },
      });
    }
  });

  it("is refused while the seat is not accepted", async () => {
    const { org, offer } = await world();
    const waiting = await createMember(org.id, "waiting", "Rosa Díaz");
    const pending = await book(offer, waiting.id, { status: "pending" });

    const reply = await shareAs(waiting, pending.id);

    expect(reply.status).toBe(409);
    expect(await reply.json()).toMatchObject({
      error: "Solo puedes compartir un viaje con asiento confirmado.",
      details: { code: "booking_not_shareable" },
    });
  });
});

describe("a trip that is no longer happening", () => {
  it("closes the link when the driver cancels the trip and blocks new ones", async () => {
    const { passenger, offer, booking } = await world();
    const { token } = await (await shareAs(passenger, booking.id)).json();

    await testDb.update(tripOffer).set({ status: "cancelled" }).where(eq(tripOffer.id, offer.id));

    const opened = await openLink(token);
    const again = await shareAs(passenger, booking.id);
    expect(opened.status).toBe(404);
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ details: { code: "booking_not_shareable" } });
  });

  it("is not shareable once its day has passed", async () => {
    const { org, driver } = await world();
    const rider = await createMember(org.id, "rider", "Lucía Paz");
    const past = await createOffer(org.id, driver.id, { date: "2026-10-18" });
    const booking = await book(past, rider.id);

    const reply = await shareAs(rider, booking.id);

    expect(reply.status).toBe(409);
    expect(await reply.json()).toMatchObject({ details: { code: "booking_not_shareable" } });
  });
});

describe("the status of the trip", () => {
  it("follows the booking: not started, in progress, arrived", async () => {
    const { passenger, booking } = await world();
    const { token } = await (await shareAs(passenger, booking.id)).json();
    const statusNow = async () => (await (await openLink(token)).json()).status;

    expect(await statusNow()).toBe("not_started");

    await testDb
      .update(seatBooking)
      .set({ startedAt: new Date("2026-10-19T12:00:00.000Z") })
      .where(eq(seatBooking.id, booking.id));
    expect(await statusNow()).toBe("in_progress");

    await testDb
      .update(seatBooking)
      .set({ arrivedAt: new Date("2026-10-19T13:00:00.000Z") })
      .where(eq(seatBooking.id, booking.id));
    expect(await statusNow()).toBe("arrived");
  });
});

describe("sharing again", () => {
  it("replaces the previous link, so only the newest one opens", async () => {
    const { passenger, booking } = await world();
    const first = await (await shareAs(passenger, booking.id)).json();
    const second = await (await shareAs(passenger, booking.id)).json();

    expect(second.token).not.toBe(first.token);
    expect((await openLink(first.token)).status).toBe(404);
    expect((await openLink(second.token)).status).toBe(200);
  });
});

describe("DELETE /share-links/{id}", () => {
  it("does not let anyone else stop the passenger's link", async () => {
    const { org, passenger, booking } = await world();
    const stranger = await createMember(org.id, "stranger", "Elena Vega");
    const { id, token } = await (await shareAs(passenger, booking.id)).json();

    const reply = (await appFor(stranger).request(`/share-links/${id}`, {
      method: "DELETE",
    })) as unknown as Reply;

    expect(reply.status).toBe(404);
    expect(await reply.json()).toMatchObject({ details: { code: "share_link_not_found" } });
    expect((await openLink(token)).status).toBe(200);
  });

  it("answers the same when the passenger stops sharing twice", async () => {
    const { passenger, booking } = await world();
    const { id } = await (await shareAs(passenger, booking.id)).json();
    const stop = async (now: Date) =>
      (await appFor(passenger, { now: () => now }).request(`/share-links/${id}`, {
        method: "DELETE",
      })) as unknown as Reply;

    const first = await (await stop(NOW)).json();
    const second = await (await stop(new Date("2026-10-19T16:00:00.000Z"))).json();

    expect(first).toEqual({ id, revokedAt: "2026-10-19T15:00:00.000Z" });
    expect(second).toEqual(first);
  });
});

describe("the public view is guarded", () => {
  it("answers 429 with Retry-After when the caller tried too many tokens", async () => {
    const { passenger, booking } = await world();
    const { token } = await (await shareAs(passenger, booking.id)).json();

    const reply = await openLink(token, {
      shareRateLimit: async () => ({ success: false, reset: NOW.getTime() + 30_000 }),
    });

    expect(reply.status).toBe(429);
    expect(reply.headers.get("Retry-After")).toBe("30");
    expect(await reply.json()).toMatchObject({
      details: { code: "too_many_share_requests" },
    });
  });

  it("still opens the link when the rate limiter is down, because a safety link must not 500", async () => {
    const { passenger, booking } = await world();
    const { token } = await (await shareAs(passenger, booking.id)).json();

    const reply = await openLink(token, {
      shareRateLimit: async () => {
        throw new Error("Redis unavailable");
      },
    });

    expect(reply.status).toBe(200);
  });

  it("also keeps a refused (429) answer out of caches", async () => {
    const reply = await openLink("C".repeat(43), {
      shareRateLimit: async () => ({ success: false, reset: NOW.getTime() + 30_000 }),
    });

    expect(reply.status).toBe(429);
    expect(reply.headers.get("Cache-Control")).toBe("no-store");
  });

  it("tells browsers and proxies not to keep what it shows", async () => {
    const { passenger, booking } = await world();
    const { token } = await (await shareAs(passenger, booking.id)).json();

    const found = await openLink(token);
    const missing = await openLink("B".repeat(43));

    expect(found.headers.get("Cache-Control")).toBe("no-store");
    expect(missing.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("what a link never reveals", () => {
  it("leaves out emails, real names and the neighbourhood the trip starts from", async () => {
    const { passenger, booking } = await world();
    const { token } = await (await shareAs(passenger, booking.id)).json();

    const text = JSON.stringify(await (await openLink(token)).json());

    for (const secret of ["@alfa.pe", "María", "Torres", "Carlos Quispe", "La Molina"]) {
      expect(text).not.toContain(secret);
    }
  });
});

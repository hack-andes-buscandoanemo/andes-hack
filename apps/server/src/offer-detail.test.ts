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
import { seatBooking, tripOffer, tripRequest } from "@andes-hack/db/schema/trips";
import { vehicle } from "@andes-hack/db/schema/vehicle";
import { createTestDb } from "@andes-hack/db/test-db";

import { eq } from "drizzle-orm";

import { createApp } from "./index";

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

async function createCommunity(slug: string) {
  const [row] = await testDb
    .insert(community)
    .values({
      slug,
      name: "Comunidad Alfa",
      kind: "company",
      destinationName: "Centro Empresarial Real",
      destinationLat: -12.0975459,
      destinationLng: -77.0375707,
      isDemo: true,
    })
    .returning();
  return row!;
}

async function createMember(
  communityId: string,
  id: string,
  name: string,
  options: { identifiesAsWoman?: boolean; alias?: string } = {},
) {
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
    identifiesAsWoman: options.identifiesAsWoman ?? false,
    alias: options.alias ?? null,
  });
  return person!;
}

async function createZones() {
  await testDb.insert(zone).values([
    { id: "la-molina", name: "La Molina", district: "La Molina", lat: -12.0853, lng: -76.9682 },
    { id: "san-borja", name: "San Borja", district: "San Borja", lat: -12.0897, lng: -77.0031 },
  ]);
}

function requestAs(person: { id: string }, path: string, init?: RequestInit) {
  const app = createApp({
    db: testDb as never,
    getSession: async () => ({ user: person }) as never,
    rateLimit: async () => ({ success: true, reset: 0 }),
  });
  return app.request(path, init);
}

async function seedOffer(communityId: string, driverId: string, seatsTotal = 3) {
  await createZones();
  const [car] = await testDb
    .insert(vehicle)
    .values({
      ownerId: driverId,
      plate: "ABC123",
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
      daysOfWeek: [1, 2, 3, 4, 5],
      seatsTotal,
      maxDetourMinutes: 10,
      note: "Salgo puntual",
    })
    .returning();
  return offer!;
}

async function seedMeetingPoint() {
  await testDb
    .insert(meetingPoint)
    .values({
      id: "san-borja-estacion-san-borja-sur",
      zoneId: "san-borja",
      name: "Estación San Borja Sur (Línea 1)",
      kind: "rail_station",
      lat: -12.1004192,
      lng: -77.001846,
      source: "test",
    })
    .onConflictDoNothing();
}

async function seedNeed(communityId: string, passengerId: string) {
  const [need] = await testDb
    .insert(tripRequest)
    .values({
      communityId,
      passengerId,
      direction: "outbound",
      originZoneId: "san-borja",
      windowStart: "07:30",
      windowEnd: "08:00",
      daysOfWeek: [1, 2, 3],
      maxWalkMinutes: 15,
      fallbackMode: "taxi_app",
    })
    .returning();
  return need!;
}

async function bookSeat(
  offer: { id: string; communityId: string },
  passengerId: string,
  status: "pending" | "accepted" | "rejected",
) {
  await seedMeetingPoint();
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
      walkMinutes: 14,
      status,
    })
    .returning();
  return booking!;
}

describe("GET /offers/{id} (US-014)", () => {
  it("shows a community member the trip without the plate", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);

    const res = await requestAs(passenger, `/offers/${offer.id}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      offerId: offer.id,
      driverName: "Mateo",
      communityName: "Comunidad Alfa",
      originZoneName: "La Molina",
      destinationName: "Centro Empresarial Real",
      direction: "outbound",
      departureTime: "07:00:00",
      date: null,
      daysOfWeek: [1, 2, 3, 4, 5],
      seatsFree: 3,
      vehicle: { make: "Toyota", model: "Corolla", plate: null },
      note: "Salgo puntual",
      isOwn: false,
      match: null,
      booking: null,
    });
  });

  it("keeps the trip private from people outside its community", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const beta = await createCommunity("comunidad-beta");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const outsider = await createMember(beta.id, "u-ana", "Ana");
    const offer = await seedOffer(alfa.id, driver.id);

    const res = await requestAs(outsider, `/offers/${offer.id}`);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      success: false,
      status: 403,
      error: "No perteneces a esta comunidad.",
      details: { code: "community_membership_required" },
    });
  });

  it("reveals the plate only once the driver accepted the passenger", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const rosa = await createMember(alfa.id, "u-rosa", "Rosa");
    const offer = await seedOffer(alfa.id, driver.id);
    await bookSeat(offer, lucia.id, "accepted");
    await bookSeat(offer, rosa.id, "pending");
    const plateSeenBy = async (person: { id: string }) =>
      (
        (await (await requestAs(person, `/offers/${offer.id}`)).json()) as {
          vehicle: { plate: string | null };
        }
      ).vehicle.plate;

    expect(await plateSeenBy(lucia)).toBe("ABC123");
    expect(await plateSeenBy(rosa)).toBeNull();
  });

  it("counts only accepted passengers against the seats and shows the person's own request", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const rosa = await createMember(alfa.id, "u-rosa", "Rosa");
    const offer = await seedOffer(alfa.id, driver.id, 3);
    await bookSeat(offer, lucia.id, "accepted");
    const pending = await bookSeat(offer, rosa.id, "pending");

    const body = (await (await requestAs(rosa, `/offers/${offer.id}`)).json()) as {
      seatsFree: number;
      booking: unknown;
    };

    expect(body.seatsFree).toBe(2);
    expect(body.booking).toEqual({ id: pending.id, status: "pending" });
  });

  it("tells the driver it is their own trip and shows them their plate", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const offer = await seedOffer(alfa.id, driver.id);

    const body = (await (await requestAs(driver, `/offers/${offer.id}`)).json()) as {
      isOwn: boolean;
      vehicle: { plate: string | null };
    };

    expect(body.isOwn).toBe(true);
    expect(body.vehicle.plate).toBe("ABC123");
  });

  it("shows the pickup the engine calculates for the passenger's saved need", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);
    await testDb.insert(tripRequest).values({
      communityId: alfa.id,
      passengerId: lucia.id,
      direction: "outbound",
      originZoneId: "san-borja",
      windowStart: "07:30",
      windowEnd: "08:00",
      daysOfWeek: [1, 2, 3],
      maxWalkMinutes: 15,
      fallbackMode: "taxi_app",
    });

    const body = (await (await requestAs(lucia, `/offers/${offer.id}`)).json()) as {
      match: unknown;
    };

    expect(body.match).toEqual({
      meetingPointName: "Estación San Borja Sur (Línea 1)",
      pickupAt: "07:29",
      arrivalAt: "07:44",
      detourMinutes: 6,
      walkMinutes: 14,
    });
  });

  it("answers 404 for an unknown trip and 401 without a session", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const unknown = "00000000-0000-4000-8000-000000000000";

    const notFound = await requestAs(lucia, `/offers/${unknown}`);
    const anonymous = await createApp({
      db: testDb as never,
      getSession: async () => null,
      rateLimit: async () => ({ success: true, reset: 0 }),
    }).request(`/offers/${unknown}`);

    expect(notFound.status).toBe(404);
    expect(((await notFound.json()) as { details: unknown }).details).toEqual({
      code: "offer_not_found",
    });
    expect(anonymous.status).toBe(401);
  });
});

describe("POST /offers/{id}/bookings (US-014)", () => {
  function requestSeat(
    person: { id: string },
    offerId: string,
    body: Record<string, unknown> = {},
  ) {
    return requestAs(person, `/offers/${offerId}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("creates a pending request with the meeting point and pickup the server calculates", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);
    await seedMeetingPoint();
    await seedNeed(alfa.id, lucia.id);

    const res = await requestSeat(lucia, offer.id, {
      message: "Voy con una mochila",
      meetingPointId: "tampered-point",
      pickupAt: "03:00",
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      booking: {
        id: expect.any(String),
        status: "pending",
        message: "Voy con una mochila",
        meetingPointName: "Estación San Borja Sur (Línea 1)",
        pickupAt: "07:29",
        arrivalAt: "07:44",
        detourMinutes: 6,
        walkMinutes: 14,
      },
    });
  });

  it("refuses a second request on the same trip", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);
    await seedMeetingPoint();
    await seedNeed(alfa.id, lucia.id);
    const first = (await (await requestSeat(lucia, offer.id)).json()) as {
      booking: { id: string };
    };

    const again = await requestSeat(lucia, offer.id);

    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({
      success: false,
      status: 409,
      error: "Ya solicitaste un asiento en este viaje.",
      details: { code: "already_requested" },
    });
    const detail = (await (await requestAs(lucia, `/offers/${offer.id}`)).json()) as {
      booking: { id: string };
    };
    expect(detail.booking.id).toBe(first.booking.id);
  });

  it("keeps a single request when the button is tapped twice at once", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);
    await seedMeetingPoint();
    await seedNeed(alfa.id, lucia.id);

    const responses = await Promise.all([
      requestSeat(lucia, offer.id),
      requestSeat(lucia, offer.id),
    ]);

    expect(responses.map((res) => res.status).sort()).toEqual([201, 409]);
  });

  it("does not let a driver request a seat on their own trip", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const offer = await seedOffer(alfa.id, driver.id);
    await seedMeetingPoint();
    await seedNeed(alfa.id, driver.id);

    const res = await requestSeat(driver, offer.id);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      success: false,
      status: 403,
      error: "No puedes solicitar un asiento en tu propio viaje.",
      details: { code: "own_offer" },
    });
  });

  it("refuses a request on a trip whose seats are all taken", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const rosa = await createMember(alfa.id, "u-rosa", "Rosa");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id, 1);
    await bookSeat(offer, rosa.id, "accepted");
    await seedNeed(alfa.id, lucia.id);

    const res = await requestSeat(lucia, offer.id);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      success: false,
      status: 409,
      error: "Este viaje ya no tiene asientos libres.",
      details: { code: "no_seats" },
    });
  });

  it("refuses a trip that changed and no longer fits the saved search", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);
    await seedMeetingPoint();
    await seedNeed(alfa.id, lucia.id);
    await testDb
      .update(tripOffer)
      .set({ daysOfWeek: [6, 7] })
      .where(eq(tripOffer.id, offer.id));

    const res = await requestSeat(lucia, offer.id);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      success: false,
      status: 409,
      error: "Este viaje cambió y ya no es compatible con tu búsqueda.",
      details: { code: "no_longer_compatible" },
    });
  });

  it("asks the person to search first when there is no saved search", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);

    const res = await requestSeat(lucia, offer.id);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      success: false,
      status: 409,
      error: "Busca tu viaje antes de solicitar un asiento.",
      details: { code: "search_required" },
    });
  });

  it("rejects a message longer than 280 characters", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);
    await seedMeetingPoint();
    await seedNeed(alfa.id, lucia.id);

    const res = await requestSeat(lucia, offer.id, { message: "a".repeat(281) });

    expect(res.status).toBe(422);
  });
});

describe("POST /bookings/{id}/cancel (US-014)", () => {
  function withdraw(person: { id: string }, bookingId: string) {
    return requestAs(person, `/bookings/${bookingId}/cancel`, { method: "POST" });
  }

  it("lets the passenger withdraw a pending request and ask again later", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);
    const pending = await bookSeat(offer, lucia.id, "pending");

    const res = await withdraw(lucia, pending.id);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      booking: { id: pending.id, status: "cancelled_by_passenger" },
    });
    const detail = (await (await requestAs(lucia, `/offers/${offer.id}`)).json()) as {
      booking: unknown;
    };
    expect(detail.booking).toBeNull();
  });

  it("hides a request that belongs to someone else", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const rosa = await createMember(alfa.id, "u-rosa", "Rosa");
    const offer = await seedOffer(alfa.id, driver.id);
    const pending = await bookSeat(offer, lucia.id, "pending");

    const res = await withdraw(rosa, pending.id);

    expect(res.status).toBe(404);
    const detail = (await (await requestAs(lucia, `/offers/${offer.id}`)).json()) as {
      booking: { status: string };
    };
    expect(detail.booking.status).toBe("pending");
  });

  it("answers the same when the request is withdrawn twice, and keeps an accepted seat", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const rosa = await createMember(alfa.id, "u-rosa", "Rosa");
    const offer = await seedOffer(alfa.id, driver.id);
    const pending = await bookSeat(offer, lucia.id, "pending");
    const accepted = await bookSeat(offer, rosa.id, "accepted");

    await withdraw(lucia, pending.id);
    const again = await withdraw(lucia, pending.id);
    const refused = await withdraw(rosa, accepted.id);

    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({
      booking: { id: pending.id, status: "cancelled_by_passenger" },
    });
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { details: unknown }).details).toEqual({
      code: "not_withdrawable",
    });
  });
});

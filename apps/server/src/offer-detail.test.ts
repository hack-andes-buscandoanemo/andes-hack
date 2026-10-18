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
import { seatBooking, tripMessage, tripOffer, tripRequest } from "@andes-hack/db/schema/trips";
import { matchRun, matchSuggestion } from "@andes-hack/db/schema/matching";
import { vehicle } from "@andes-hack/db/schema/vehicle";
import { createTestDb } from "@andes-hack/db/test-db";

import { eq, sql } from "drizzle-orm";

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
  options: { identifiesAsWoman?: boolean; alias?: string; isTeam?: boolean } = {},
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
    isTeam: options.isTeam ?? false,
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
  if (status === "accepted") {
    await testDb
      .update(tripOffer)
      .set({ seatsTaken: sql`${tripOffer.seatsTaken} + 1` })
      .where(eq(tripOffer.id, offer.id));
  }
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
      status: "active",
      driverName: "Mateo",
      driverPhotoUrl: null,
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
      hasOpenNeed: false,
      match: null,
      booking: null,
      fuelEstimate: { tripSoles: 10.04, perOccupantSoles: 5.02, occupants: 2 },
    });
  });

  it("estimates the fuel of the leg for the driver, the accepted passengers and the person looking", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    const rider = await createMember(alfa.id, "u-rosa", "Rosa");
    const offer = await seedOffer(alfa.id, driver.id);
    await bookSeat(offer, rider.id, "accepted");

    // La Molina → Centro Empresarial Real: 15.77 km by OSRM ÷ 35 km/gal × S/ 22,29 = S/ 10,04.
    const fuelSeenBy = async (person: { id: string }) =>
      ((await (await requestAs(person, `/offers/${offer.id}`)).json()) as { fuelEstimate: unknown })
        .fuelEstimate;
    const asPassenger = await fuelSeenBy(passenger);
    const asDriver = await fuelSeenBy(driver);
    const asRider = await fuelSeenBy(rider);

    // Lucía would be the third in the car; Mateo and Rosa are already the two aboard.
    expect(asPassenger).toEqual({ tripSoles: 10.04, perOccupantSoles: 3.34, occupants: 3 });
    expect(asDriver).toEqual({ tripSoles: 10.04, perOccupantSoles: 5.02, occupants: 2 });
    expect(asRider).toEqual({ tripSoles: 10.04, perOccupantSoles: 5.02, occupants: 2 });
  });

  it("reads the return leg from the headquarters back to the zone", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);
    await testDb.update(tripOffer).set({ direction: "return" }).where(eq(tripOffer.id, offer.id));

    const body = (await (await requestAs(passenger, `/offers/${offer.id}`)).json()) as {
      fuelEstimate: unknown;
    };

    // Centro Empresarial Real → La Molina is 14.89 km by OSRM: S/ 9,48 between two.
    expect(body.fuelEstimate).toEqual({ tripSoles: 9.48, perOccupantSoles: 4.74, occupants: 2 });
  });

  it("still shows a trip whose driver left the community, under their account name", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);
    await testDb.delete(communityMember).where(eq(communityMember.userId, driver.id));

    const res = await requestAs(passenger, `/offers/${offer.id}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ driverName: "Mateo" });
  });

  it("keeps the trip private from people outside its community", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const beta = await createCommunity("comunidad-beta");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const outsider = await createMember(beta.id, "u-ana", "Ana");
    const offer = await seedOffer(alfa.id, driver.id);

    const res = await requestAs(outsider, `/offers/${offer.id}`);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      status: 404,
      error: "No encontramos este viaje.",
      details: { code: "offer_not_found" },
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

describe("POST /bookings/{id}/accept (US-020)", () => {
  it("keeps a rejected passenger from requesting the same offer again", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);
    const booking = await bookSeat(offer, passenger.id, "pending");

    const rejected = await requestAs(driver, `/bookings/${booking.id}/reject`, { method: "POST" });
    expect(rejected.status).toBe(200);
    expect(await rejected.json()).toEqual({ booking: { id: booking.id, status: "rejected" } });
    const detail = await requestAs(passenger, `/offers/${offer.id}`);
    expect(((await detail.json()) as { booking: { id: string; status: string } }).booking).toEqual({
      id: booking.id,
      status: "rejected",
    });
    const retry = await requestAs(passenger, `/offers/${offer.id}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(retry.status).toBe(409);
    expect(((await retry.json()) as { error: string }).error).toBe(
      "El conductor no pudo aceptar tu solicitud.",
    );
  });

  it("shows the driver pending requests without exposing passenger email", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía", { alias: "Lucía R." });
    const offer = await seedOffer(alfa.id, driver.id);
    const booking = await bookSeat(offer, passenger.id, "pending");
    await testDb
      .update(seatBooking)
      .set({ message: "Estaré en la estación." })
      .where(eq(seatBooking.id, booking.id));

    const response = await requestAs(driver, `/offers/${offer.id}/bookings`);
    const body = (await response.json()) as {
      seatsTaken: number;
      seatsTotal: number;
      bookings: Array<{ passengerName: string; meetingPointName: string; message: string | null }>;
    };

    expect(response.status).toBe(200);
    expect(body.seatsTaken).toBe(0);
    expect(body.seatsTotal).toBe(3);
    expect(body.bookings).toEqual([
      {
        id: booking.id,
        passengerName: "Lucía R.",
        passengerPhotoUrl: null,
        status: "pending",
        meetingPointName: "Estación San Borja Sur (Línea 1)",
        pickupAt: "07:29",
        detourMinutes: 6,
        message: "Estaré en la estación.",
        avoidsCar: true,
        recommended: false,
        today: null,
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("@alfa.pe");
    const forbidden = await requestAs(passenger, `/offers/${offer.id}/bookings`);
    expect(forbidden.status).toBe(403);
  });

  it("marks a request selected by the optimizer as recommended", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);
    const booking = await bookSeat(offer, passenger.id, "pending");
    const [run] = await testDb
      .insert(matchRun)
      .values({
        communityId: alfa.id,
        direction: "outbound",
        date: "2026-10-19",
        algorithm: "optimizer",
        inputSummary: { offers: 1, requests: 1 },
        metrics: {
          passengersMatched: 1,
          carTripsAvoided: 1,
          detourMinutes: 6,
          walkMinutes: 14,
          unassigned: 0,
        },
        durationMs: 5,
      })
      .returning();
    await testDb.insert(matchSuggestion).values({
      runId: run!.id,
      offerId: offer.id,
      requestId: booking.requestId,
      passengerId: passenger.id,
      meetingPointId: "san-borja-estacion-san-borja-sur",
      position: 0,
      pickupAt: "07:29",
      arrivalAt: "07:44",
      detourMinutes: 6,
      walkMinutes: 14,
      avoidsCarTrip: true,
    });

    const response = await requestAs(driver, `/offers/${offer.id}/bookings`);

    expect(response.status).toBe(200);
    expect(
      ((await response.json()) as { bookings: Array<{ recommended: boolean }> }).bookings[0]
        ?.recommended,
    ).toBe(true);
  });

  it("accepts only one request competing for the last seat", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const rosa = await createMember(alfa.id, "u-rosa", "Rosa");
    const offer = await seedOffer(alfa.id, driver.id, 1);
    const first = await bookSeat(offer, lucia.id, "pending");
    const second = await bookSeat(offer, rosa.id, "pending");

    const responses = await Promise.all([
      requestAs(driver, `/bookings/${first.id}/accept`, { method: "POST" }),
      requestAs(driver, `/bookings/${second.id}/accept`, { method: "POST" }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const rejected = responses.find((response) => response.status === 409)!;
    expect(((await rejected.json()) as { error: string }).error).toBe("Tu auto ya está lleno.");
    const accepted = responses.find((response) => response.status === 200)!;
    const acceptedBooking = (await accepted.json()) as { booking: { id: string } };
    const acceptedPassenger = acceptedBooking.booking.id === first.id ? lucia : rosa;
    const detail = await requestAs(acceptedPassenger, `/offers/${offer.id}`);
    const detailBody = (await detail.json()) as {
      booking: { status: string };
      vehicle: { plate: string };
    };
    expect(detailBody.booking.status).toBe("accepted");
    expect(detailBody.vehicle.plate).toBe("ABC123");
  });
});

describe("GET and POST /offers/{id}/messages (US-024)", () => {
  it("lets accepted passengers and the driver exchange messages, not other members", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo", { alias: "Mateo M." });
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía", { alias: "Lucía R." });
    const outsider = await createMember(alfa.id, "u-rosa", "Rosa");
    const offer = await seedOffer(alfa.id, driver.id);
    await bookSeat(offer, passenger.id, "accepted");

    const sent = await requestAs(passenger, `/offers/${offer.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "quick", body: "Estoy en el punto de encuentro" }),
    });
    expect(sent.status).toBe(201);
    expect(
      ((await sent.json()) as { message: { body: string; senderName: string } }).message,
    ).toMatchObject({
      body: "Estoy en el punto de encuentro",
      senderName: "Lucía R.",
      senderRole: "passenger",
    });

    const history = await requestAs(driver, `/offers/${offer.id}/messages`);
    expect(((await history.json()) as { messages: Array<{ body: string }> }).messages).toHaveLength(
      1,
    );
    const passengerChats = (await (await requestAs(passenger, "/me/chats")).json()) as {
      chats: Array<{ offerId: string; role: string; meetingPointName: string | null }>;
    };
    expect(passengerChats.chats).toEqual([
      expect.objectContaining({
        offerId: offer.id,
        role: "passenger",
        meetingPointName: "Estación San Borja Sur (Línea 1)",
      }),
    ]);
    const driverChats = (await (await requestAs(driver, "/me/chats")).json()) as {
      chats: Array<{ offerId: string; role: string }>;
    };
    expect(driverChats.chats).toEqual([
      expect.objectContaining({ offerId: offer.id, role: "driver" }),
    ]);
    const forbidden = await requestAs(outsider, `/offers/${offer.id}/messages`);
    expect(forbidden.status).toBe(403);
  });

  it("rejects message bodies over 500 characters", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);
    await bookSeat(offer, passenger.id, "accepted");

    const response = await requestAs(passenger, `/offers/${offer.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "text", body: "a".repeat(501) }),
    });
    expect(response.status).toBe(422);
  });
});

describe("GET /public/communities/{slug}/stats (US-031)", () => {
  it("shows community-wide activity, excludes team accounts, and caches for 30 seconds", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);
    const booking = await bookSeat(offer, passenger.id, "accepted");
    await testDb
      .update(communityMember)
      .set({ travelRole: "passenger" })
      .where(eq(communityMember.userId, passenger.id));
    await testDb
      .update(tripRequest)
      .set({ hadResults: true })
      .where(eq(tripRequest.id, booking.requestId));
    await createMember(alfa.id, "u-team", "Equipo", { alias: "Equipo" });
    await testDb
      .update(communityMember)
      .set({ isTeam: true })
      .where(eq(communityMember.userId, "u-team"));
    const cache = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue("OK") };
    const app = createApp({
      db: testDb as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
      statsRateLimit: async () => ({ success: true, reset: 0 }),
      statsCache: cache,
      now: () => new Date("2026-10-18T12:00:00.000Z"),
    });
    const response = await app.request("/public/communities/comunidad-alfa/stats", {
      headers: { "cf-connecting-ip": "192.0.2.10" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      community: { name: "Comunidad Alfa", isDemo: true },
      activity: { enrolled: 2, drivers: 1, activeOffers: 1 },
      comparison: null,
      updatedAt: "2026-10-18T12:00:00.000Z",
    });
    expect(cache.set).toHaveBeenCalledWith(
      "andes-hack:public-stats:comunidad-alfa",
      expect.any(Object),
      30,
    );
  });
});

describe("Solo mujeres trips (US-014)", () => {
  async function womenOnlyOffer() {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-rosa", "Rosa", { identifiesAsWoman: true });
    const offer = await seedOffer(alfa.id, driver.id);
    await testDb.update(tripOffer).set({ womenOnly: true }).where(eq(tripOffer.id, offer.id));
    await seedMeetingPoint();
    return { alfa, offer };
  }

  it("gives a passenger who does not identify as a woman no pickup and no seat", async () => {
    const { alfa, offer } = await womenOnlyOffer();
    const carlos = await createMember(alfa.id, "u-carlos", "Carlos");
    await seedNeed(alfa.id, carlos.id);

    const detail = (await (await requestAs(carlos, `/offers/${offer.id}`)).json()) as {
      match: unknown;
    };
    const res = await requestAs(carlos, `/offers/${offer.id}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(detail.match).toBeNull();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ details: { code: "no_longer_compatible" } });
  });

  it("refuses a seat with a man driver to a woman who searched with Solo mujeres", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const mateo = await createMember(alfa.id, "u-mateo", "Mateo");
    const offer = await seedOffer(alfa.id, mateo.id);
    await seedMeetingPoint();
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía", { identifiesAsWoman: true });
    await requestAs(lucia, `/communities/${alfa.id}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        direction: "outbound",
        originZoneId: "san-borja",
        windowStart: "07:30",
        windowEnd: "08:00",
        daysOfWeek: [1, 2, 3],
        fallbackMode: "taxi_app",
        womenOnly: true,
      }),
    });

    const res = await requestAs(lucia, `/offers/${offer.id}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ details: { code: "no_longer_compatible" } });
  });

  it("lets her request that seat as soon as she turns Solo mujeres off in her profile", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const mateo = await createMember(alfa.id, "u-mateo", "Mateo");
    const offer = await seedOffer(alfa.id, mateo.id);
    await seedMeetingPoint();
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía", { identifiesAsWoman: true });
    const send = (path: string, method: string, body: unknown) =>
      requestAs(lucia, path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    await send(`/communities/${alfa.id}/search`, "POST", {
      direction: "outbound",
      originZoneId: "san-borja",
      windowStart: "07:30",
      windowEnd: "08:00",
      daysOfWeek: [1, 2, 3],
      fallbackMode: "taxi_app",
      womenOnly: true,
    });
    await send(`/communities/${alfa.id}/preferences`, "PUT", {
      identifiesAsWoman: true,
      womenOnly: false,
    });

    const res = await send(`/offers/${offer.id}/bookings`, "POST", {});

    expect(res.status).toBe(201);
  });

  it("lets a passenger who identifies as a woman request the same trip", async () => {
    const { alfa, offer } = await womenOnlyOffer();
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía", { identifiesAsWoman: true });
    await seedNeed(alfa.id, lucia.id);

    const res = await requestAs(lucia, `/offers/${offer.id}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(res.status).toBe(201);
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
      lateCancelled: false,
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

  it("answers the same when the request is withdrawn twice, and releases an accepted seat atomically (US-022)", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const rosa = await createMember(alfa.id, "u-rosa", "Rosa");
    const offer = await seedOffer(alfa.id, driver.id, 2);
    const pending = await bookSeat(offer, lucia.id, "pending");
    const accepted = await bookSeat(offer, rosa.id, "accepted");
    await testDb.update(tripOffer).set({ seatsTaken: 1 }).where(eq(tripOffer.id, offer.id));

    await withdraw(lucia, pending.id);
    const again = await withdraw(lucia, pending.id);

    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({
      booking: { id: pending.id, status: "cancelled_by_passenger" },
      lateCancelled: false,
    });

    const cancelled = await withdraw(rosa, accepted.id);
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({
      booking: { id: accepted.id, status: "cancelled_by_passenger" },
    });

    const [updatedOffer] = await testDb
      .select({ seatsTaken: tripOffer.seatsTaken })
      .from(tripOffer)
      .where(eq(tripOffer.id, offer.id));
    expect(updatedOffer?.seatsTaken).toBe(0);

    const cancelledAgain = await withdraw(rosa, accepted.id);
    expect(cancelledAgain.status).toBe(200);
    const [stillZero] = await testDb
      .select({ seatsTaken: tripOffer.seatsTaken })
      .from(tripOffer)
      .where(eq(tripOffer.id, offer.id));
    expect(stillZero?.seatsTaken).toBe(0);
  });

  it("marks a cancellation made less than 60 minutes before pickup (US-022)", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const rosa = await createMember(alfa.id, "u-rosa", "Rosa");
    const offer = await seedOffer(alfa.id, driver.id, 2);
    const accepted = await bookSeat(offer, rosa.id, "accepted");

    // 06:40 in America/Lima (UTC-5) is 11:40 UTC -> 49 minutes before pickup (less than 60 min)
    const appWithLateClock = createApp({
      db: testDb as never,
      getSession: (async () => ({
        user: { id: rosa.id, email: "rosa@alfa.pe" },
        session: {},
      })) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
      now: () => new Date("2026-10-19T11:40:00Z"),
    });

    const res = await appWithLateClock.request(`/bookings/${accepted.id}/cancel`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      booking: { id: string; status: string };
      lateCancelled: boolean;
    };
    expect(body.lateCancelled).toBe(true);
  });
});

describe("DELETE /me (US-029)", () => {
  it("removes the account and personal activity while retaining anonymous trip totals", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);
    await bookSeat(offer, passenger.id, "accepted");
    const photoKey = `profile-photos/${driver.id}/11111111-1111-4111-8111-111111111111.jpg`;
    await testDb.update(user).set({ image: photoKey }).where(eq(user.id, driver.id));
    await testDb
      .insert(tripMessage)
      .values({ offerId: offer.id, senderId: driver.id, body: "Te espero" });
    const cache = { get: async () => null, set: async () => undefined };
    const deletePhoto = vi.fn(async () => undefined);
    const profilePhotoStorage = {
      getUploadUrl: async () => "https://r2.example/upload",
      getFileMetadata: async () => null,
      downloadFileAsBuffer: async () => Buffer.from([]),
      getDownloadUrl: async () => "https://r2.example/photo?signature=read",
      deleteFile: deletePhoto,
    };
    const neonHttpDb = new Proxy(testDb, {
      get(target, property) {
        if (property === "transaction") {
          return () => {
            throw new Error("No transactions support in neon-http driver");
          };
        }
        return Reflect.get(target, property, target);
      },
    });
    const app = createApp({
      db: neonHttpDb as never,
      getSession: async () => ({ user: driver }) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
      statsRateLimit: async () => ({ success: true, reset: 0 }),
      statsCache: cache,
      profilePhotoStorage,
      now: () => new Date("2026-10-18T12:00:00.000Z"),
    });

    const deleted = await app.request("/me", { method: "DELETE" });
    const payload = await deleted.json();
    const me = await app.request("/me");
    const stats = await app.request("/public/communities/comunidad-alfa/stats");

    expect(deleted.status, JSON.stringify(payload)).toBe(200);
    expect(payload).toEqual({
      message: "Tus datos fueron eliminados.",
      deletedAt: "2026-10-18T12:00:00.000Z",
    });
    expect(deletePhoto).toHaveBeenCalledWith(photoKey);
    expect(me.status).toBe(404);
    expect(await stats.json()).toMatchObject({
      activity: { enrolled: 1, activeOffers: 0, acceptedRequests: 1 },
    });
  });

  it("keeps deleted team members out of retained trip metrics", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-team-driver", "Mateo", { isTeam: true });
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);
    await bookSeat(offer, passenger.id, "accepted");
    const cache = { get: async () => null, set: async () => undefined };
    const app = createApp({
      db: testDb as never,
      getSession: async () => ({ user: driver }) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
      statsRateLimit: async () => ({ success: true, reset: 0 }),
      statsCache: cache,
    });

    const deleted = await app.request("/me", { method: "DELETE" });
    const stats = await app.request("/public/communities/comunidad-alfa/stats");

    expect(deleted.status).toBe(200);
    expect(
      ((await stats.json()) as { activity: { acceptedRequests: number } }).activity
        .acceptedRequests,
    ).toBe(0);
  });
});

describe("trip message cursor (US-024)", () => {
  it("returns messages after an exact cursor when timestamps match", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    const offer = await seedOffer(alfa.id, driver.id);
    await bookSeat(offer, passenger.id, "accepted");
    const createdAt = new Date("2026-10-18T12:00:00.000Z");
    const firstId = "11111111-1111-4111-8111-111111111111";
    await testDb.insert(tripMessage).values([
      { id: firstId, offerId: offer.id, senderId: driver.id, body: "Primero", createdAt },
      {
        id: "22222222-2222-4222-8222-222222222222",
        offerId: offer.id,
        senderId: passenger.id,
        body: "Segundo",
        createdAt,
      },
    ]);
    const app = createApp({
      db: testDb as never,
      getSession: async () => ({ user: driver }) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
    });

    const response = await app.request(`/offers/${offer.id}/messages?after=${firstId}`);

    expect(response.status).toBe(200);
    expect(
      ((await response.json()) as { messages: { body: string }[] }).messages.map(
        (message) => message.body,
      ),
    ).toEqual(["Segundo"]);
  });
});

describe("profile photo routes (US-039)", () => {
  it("confirms a valid staged photo before making its signed URL available", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const jpeg = Buffer.alloc(64);
    jpeg.set([0xff, 0xd8, 0xff]);
    const storage = {
      getUploadUrl: async () => "https://r2.example/upload?signature=upload",
      getFileMetadata: async () => ({ contentType: "image/jpeg", contentLength: jpeg.length }),
      downloadFileAsBuffer: async () => jpeg,
      getDownloadUrl: async () => "https://r2.example/photo?signature=read",
      deleteFile: async () => undefined,
    };
    const app = createApp({
      db: testDb as never,
      getSession: async () => ({ user: lucia }) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
      profilePhotoStorage: storage,
    });
    const headers = { "content-type": "application/json", "x-community-id": alfa.id };

    const upload = await app.request("/me/profile-photo/upload", {
      method: "POST",
      headers,
      body: JSON.stringify({ contentType: "image/jpeg", size: 64 }),
    });
    const staged = (await upload.json()) as { key: string; uploadUrl: string; expiresIn: number };
    const confirm = await app.request("/me/profile-photo/confirm", {
      method: "POST",
      headers,
      body: JSON.stringify({ key: staged.key }),
    });
    const ownPhoto = await app.request("/me/profile-photo", {
      headers: { "x-community-id": alfa.id },
    });

    expect(upload.status).toBe(200);
    expect(staged).toMatchObject({
      key: expect.stringMatching(/^profile-photos\/u-lucia\//),
      uploadUrl: "https://r2.example/upload?signature=upload",
      expiresIn: 300,
    });
    expect(confirm.status).toBe(200);
    expect(await confirm.json()).toEqual({ photoUrl: "https://r2.example/photo?signature=read" });
    expect(await ownPhoto.json()).toEqual({ photoUrl: "https://r2.example/photo?signature=read" });
  });

  it("keeps the current photo when the staged object is too large", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const lucia = await createMember(alfa.id, "u-lucia", "Lucía");
    const currentKey = "profile-photos/u-lucia/11111111-1111-4111-8111-111111111111.jpg";
    const stagedKey = "profile-photos/u-lucia/22222222-2222-4222-8222-222222222222.jpg";
    await testDb.update(user).set({ image: currentKey }).where(eq(user.id, lucia.id));
    const storage = {
      getUploadUrl: async () => "https://r2.example/upload",
      getFileMetadata: async () => ({ contentType: "image/jpeg", contentLength: 3 * 1024 * 1024 }),
      downloadFileAsBuffer: vi.fn(async () => Buffer.from([0xff, 0xd8, 0xff])),
      getDownloadUrl: async (key: string) => `https://r2.example/${key}?signature=read`,
      deleteFile: vi.fn(async () => undefined),
    };
    const app = createApp({
      db: testDb as never,
      getSession: async () => ({ user: lucia }) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
      profilePhotoStorage: storage,
    });
    const headers = { "content-type": "application/json", "x-community-id": alfa.id };

    const rejected = await app.request("/me/profile-photo/confirm", {
      method: "POST",
      headers,
      body: JSON.stringify({ key: stagedKey }),
    });
    const current = await app.request("/me/profile-photo", {
      headers: { "x-community-id": alfa.id },
    });

    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({
      error: "Usa una imagen JPG, PNG o WebP de hasta 2 MB.",
    });
    expect(await current.json()).toEqual({
      photoUrl: `https://r2.example/${currentKey}?signature=read`,
    });
  });

  it("signs a driver's photo only for a member of the trip community", async () => {
    const alfa = await createCommunity("comunidad-alfa");
    const beta = await createCommunity("comunidad-beta");
    const driver = await createMember(alfa.id, "u-mateo", "Mateo");
    const passenger = await createMember(alfa.id, "u-lucia", "Lucía");
    const outsider = await createMember(beta.id, "u-rosa", "Rosa");
    const photoKey = "profile-photos/u-mateo/11111111-1111-4111-8111-111111111111.jpg";
    await testDb.update(user).set({ image: photoKey }).where(eq(user.id, driver.id));
    const offer = await seedOffer(alfa.id, driver.id);
    const storage = {
      getUploadUrl: async () => "https://r2.example/upload",
      getFileMetadata: async () => null,
      downloadFileAsBuffer: async () => Buffer.from([]),
      getDownloadUrl: vi.fn(async () => "https://r2.example/photo?signature=community"),
      deleteFile: async () => undefined,
    };
    const app = createApp({
      db: testDb as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
      profilePhotoStorage: storage,
      getSession: async (headers) => {
        const userId = headers.get("x-test-user");
        return { user: userId === outsider.id ? outsider : passenger } as never;
      },
    });

    const visible = await app.request(`/offers/${offer.id}`, {
      headers: { "x-test-user": passenger.id },
    });
    const hidden = await app.request(`/offers/${offer.id}`, {
      headers: { "x-test-user": outsider.id },
    });

    expect(((await visible.json()) as { driverPhotoUrl: string | null }).driverPhotoUrl).toBe(
      "https://r2.example/photo?signature=community",
    );
    expect(hidden.status).toBe(404);
    expect(storage.getDownloadUrl).toHaveBeenCalledOnce();
  });
});

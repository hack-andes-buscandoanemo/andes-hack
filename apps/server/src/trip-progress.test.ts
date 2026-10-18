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

// Monday 2026-10-19 in Lima (UTC-5); the trip leaves at 07:00 and picks up at 07:29.
const TRIP_DAY = "2026-10-19";
const at = (limaTime: string) => atDay(TRIP_DAY, limaTime);
const atDay = (day: string, limaTime: string) => new Date(`${day}T${limaTime}:00.000-05:00`);

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
  options: {
    date?: string;
    daysOfWeek?: number[];
    status?: "active" | "paused" | "cancelled";
    departureTime?: string;
  } = {},
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
      departureTime: options.departureTime ?? "07:00",
      ...(options.date
        ? { date: options.date }
        : { daysOfWeek: options.daysOfWeek ?? [1, 2, 3, 4, 5, 6, 7] }),
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
    })
    .returning();
  return booking!;
}

type Reply = { status: number; json(): Promise<any> };

function appAt(person: { id: string } | null, now: Date) {
  return createApp({
    db: testDb as never,
    getSession: async () => (person ? ({ user: person } as never) : null),
    rateLimit: async () => ({ success: true, reset: 0 }),
    now: () => now,
  });
}

async function post(person: { id: string } | null, path: string, now: Date) {
  return (await appAt(person, now).request(path, { method: "POST" })) as unknown as Reply;
}

async function world() {
  const org = await seedWorld();
  const driver = await createMember(org.id, "driver", "Carlos Quispe Huamán", "Carlos Q.");
  const passenger = await createMember(org.id, "passenger", "María Torres Rojas", "Mari T.");
  const offer = await createOffer(org.id, driver.id, { date: TRIP_DAY });
  const booking = await book(offer, passenger.id);
  return { org, driver, passenger, offer, booking };
}

describe("POST /offers/{id}/start", () => {
  it("starts the trip for every accepted passenger with the server time", async () => {
    const { driver, offer } = await world();

    const reply = await post(driver, `/offers/${offer.id}/start`, at("06:30"));

    expect(reply.status).toBe(200);
    expect(await reply.json()).toEqual({
      tripDate: "2026-10-19",
      startedAt: "2026-10-19T11:30:00.000Z",
      boarded: 1,
      message: "Viaje en curso.",
    });
  });
});

describe("the time window to start", () => {
  it("refuses to start more than 30 minutes before departure and changes nothing", async () => {
    const { driver, passenger, offer } = await world();

    const reply = await post(driver, `/offers/${offer.id}/start`, at("06:29"));

    expect(reply.status).toBe(409);
    const body = await reply.json();
    expect(body.error).toBe("Podrás iniciar el viaje 30 minutos antes de la salida.");
    expect(body.details.code).toBe("trip_too_early");
    expect(await progressesOf(passenger, at("06:29"))).toEqual(["not_started"]);
  });
});

describe("who can start", () => {
  it("lets only the driver of that trip start it", async () => {
    const { org, passenger, offer } = await world();
    const stranger = await createMember(org.id, "stranger", "Otra Persona", "Otra P.");

    // 404 for anyone else: a trip that is not yours looks like one that does not exist.
    for (const person of [passenger, stranger]) {
      const reply = await post(person, `/offers/${offer.id}/start`, at("06:30"));
      expect(reply.status).toBe(404);
      expect((await reply.json()).details.code).toBe("offer_not_found");
    }
    expect(await progressesOf(passenger, at("06:30"))).toEqual(["not_started"]);
  });

  it("answers 404 for a trip that does not exist", async () => {
    const { driver } = await world();

    const reply = await post(
      driver,
      `/offers/6f1f3c1e-9a52-4a54-8d2a-0d1f0c0d9b11/start`,
      at("06:30"),
    );

    expect(reply.status).toBe(404);
    expect((await reply.json()).details.code).toBe("offer_not_found");
  });
});

describe("starting twice", () => {
  it("keeps the first moment and answers the same", async () => {
    const { driver, offer } = await world();
    await post(driver, `/offers/${offer.id}/start`, at("06:30"));

    const again = await post(driver, `/offers/${offer.id}/start`, at("06:40"));

    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({
      tripDate: "2026-10-19",
      startedAt: "2026-10-19T11:30:00.000Z",
      boarded: 1,
      message: "Viaje en curso.",
    });
  });
});

describe("a trip that cannot start", () => {
  it("refuses to start a cancelled trip", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver", "Carlos Quispe Huamán");
    const passenger = await createMember(org.id, "passenger", "María Torres Rojas");
    const offer = await createOffer(org.id, driver.id, { date: TRIP_DAY, status: "cancelled" });
    await book(offer, passenger.id);

    const reply = await post(driver, `/offers/${offer.id}/start`, at("06:30"));

    expect(reply.status).toBe(409);
    expect((await reply.json()).details.code).toBe("trip_cancelled");
  });
});

describe("a trip that is not today", () => {
  it("refuses to start a one-off trip planned for another day", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver", "Carlos Quispe Huamán");
    const passenger = await createMember(org.id, "passenger", "María Torres Rojas");
    const offer = await createOffer(org.id, driver.id, { date: "2026-10-20" });
    await book(offer, passenger.id);

    const reply = await post(driver, `/offers/${offer.id}/start`, at("06:30"));

    expect(reply.status).toBe(409);
    const body = await reply.json();
    expect(body.error).toBe("Este viaje no es para hoy.");
    expect(body.details.code).toBe("trip_not_today");
  });
});

describe("a weekly trip", () => {
  it("starts on its weekdays and not on the others", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver", "Carlos Quispe Huamán");
    const passenger = await createMember(org.id, "passenger", "María Torres Rojas");
    const tuesdays = await createOffer(org.id, driver.id, { daysOfWeek: [2] });
    const mondays = await createOffer(org.id, driver.id, { daysOfWeek: [1, 3] });
    await book(tuesdays, passenger.id);
    await book(mondays, passenger.id);

    const onTuesdays = await post(driver, `/offers/${tuesdays.id}/start`, at("06:30"));
    const onMondays = await post(driver, `/offers/${mondays.id}/start`, at("06:30"));

    expect(onTuesdays.status).toBe(409);
    expect(onMondays.status).toBe(200);
  });
});

describe("POST /bookings/{id}/board", () => {
  it("lets the accepted passenger say they are in the car", async () => {
    const { passenger, booking } = await world();

    const reply = await post(passenger, `/bookings/${booking.id}/board`, at("06:45"));

    expect(reply.status).toBe(200);
    expect(await reply.json()).toEqual({
      booking: {
        id: booking.id,
        tripDate: "2026-10-19",
        startedAt: "2026-10-19T11:45:00.000Z",
        arrivedAt: null,
        outcome: null,
      },
      message: "Viaje en curso.",
    });
  });
});

describe("who can board", () => {
  it("refuses a request that is pending or rejected and changes nothing", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver", "Carlos Quispe Huamán");
    const waiting = await createMember(org.id, "waiting", "Ana Waiting");
    const turnedDown = await createMember(org.id, "turned", "Rosa Turned");
    const offer = await createOffer(org.id, driver.id, { date: TRIP_DAY });
    const pending = await book(offer, waiting.id, { status: "pending" });
    const rejected = await book(offer, turnedDown.id, { status: "rejected" });

    for (const [person, booking] of [
      [waiting, pending],
      [turnedDown, rejected],
    ] as const) {
      const reply = await post(person, `/bookings/${booking.id}/board`, at("06:45"));
      expect(reply.status).toBe(409);
      const body = await reply.json();
      expect(body.error).toBe("Solo puedes marcar el viaje si tu asiento está confirmado.");
      expect(body.details.code).toBe("booking_not_accepted");
    }
  });
});

describe("the time window to board", () => {
  it("applies the same 30 minute window to the passenger", async () => {
    const { passenger, booking } = await world();

    const reply = await post(passenger, `/bookings/${booking.id}/board`, at("06:29"));

    expect(reply.status).toBe(409);
    const body = await reply.json();
    expect(body.error).toBe("Podrás iniciar el viaje 30 minutos antes de la salida.");
    expect(body.details.code).toBe("trip_too_early");
    expect(await progressesOf(passenger, at("06:29"))).toEqual(["not_started"]);
  });
});

describe("boarding what is not yours or not running", () => {
  it("hides the booking from anyone else and refuses a cancelled trip", async () => {
    const { org, driver, passenger, offer, booking } = await world();
    const stranger = await createMember(org.id, "stranger", "Otra Persona");

    const notMine = await post(stranger, `/bookings/${booking.id}/board`, at("06:45"));
    const byDriver = await post(driver, `/bookings/${booking.id}/board`, at("06:45"));
    await testDb.update(tripOffer).set({ status: "cancelled" }).where(eq(tripOffer.id, offer.id));
    const cancelled = await post(passenger, `/bookings/${booking.id}/board`, at("06:45"));

    expect(notMine.status).toBe(404);
    expect(byDriver.status).toBe(404);
    expect(cancelled.status).toBe(409);
    expect((await cancelled.json()).details.code).toBe("trip_cancelled");
  });
});

describe("POST /bookings/{id}/arrive", () => {
  it("completes the booking with the server time once the trip is under way", async () => {
    const { driver, passenger, offer, booking } = await world();
    await post(driver, `/offers/${offer.id}/start`, at("06:30"));

    const reply = await post(passenger, `/bookings/${booking.id}/arrive`, at("07:55"));

    expect(reply.status).toBe(200);
    expect(await reply.json()).toEqual({
      booking: {
        id: booking.id,
        tripDate: "2026-10-19",
        startedAt: "2026-10-19T11:30:00.000Z",
        arrivedAt: "2026-10-19T12:55:00.000Z",
        outcome: "completed",
      },
      message: "Llegada confirmada. ¡Gracias por compartir el viaje!",
    });
  });
});

describe("arriving without having travelled", () => {
  it("refuses a pending or rejected request with 409 and changes nothing", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver", "Carlos Quispe Huamán");
    const waiting = await createMember(org.id, "waiting", "Ana Waiting");
    const turnedDown = await createMember(org.id, "turned", "Rosa Turned");
    const offer = await createOffer(org.id, driver.id, { date: TRIP_DAY });
    const pending = await book(offer, waiting.id, { status: "pending" });
    const rejected = await book(offer, turnedDown.id, { status: "rejected" });

    for (const [person, booking, status] of [
      [waiting, pending, "pending"],
      [turnedDown, rejected, "rejected"],
    ] as const) {
      const reply = await post(person, `/bookings/${booking.id}/arrive`, at("07:55"));
      expect(reply.status).toBe(409);
      expect((await reply.json()).details.code).toBe("booking_not_accepted");
      const [after] = await testDb.select().from(seatBooking).where(eq(seatBooking.id, booking.id));
      expect(after!.status).toBe(status);
    }
  });
});

describe("arriving before the trip started", () => {
  it("refuses with 409 while nobody has started it", async () => {
    const { passenger, booking } = await world();

    const reply = await post(passenger, `/bookings/${booking.id}/arrive`, at("07:55"));

    expect(reply.status).toBe(409);
    const body = await reply.json();
    expect(body.error).toBe("El viaje todavía no empezó.");
    expect(body.details.code).toBe("trip_not_started");
    const [after] = await testDb.select().from(seatBooking).where(eq(seatBooking.id, booking.id));
    expect(after!.status).toBe("accepted");
  });
});

describe("arriving twice", () => {
  async function startedWorld() {
    const ctx = await world();
    await post(ctx.driver, `/offers/${ctx.offer.id}/start`, at("06:30"));
    return ctx;
  }

  it("keeps the first arrival time when the passenger confirms again", async () => {
    const { passenger, booking } = await startedWorld();
    await post(passenger, `/bookings/${booking.id}/arrive`, at("07:55"));

    const again = await post(passenger, `/bookings/${booking.id}/arrive`, at("08:10"));

    expect(again.status).toBe(200);
    expect((await again.json()).booking.arrivedAt).toBe("2026-10-19T12:55:00.000Z");
  });

  it("answers both taps of a double submit with the same completed booking", async () => {
    const { passenger, booking } = await startedWorld();

    const replies = await Promise.all([
      post(passenger, `/bookings/${booking.id}/arrive`, at("07:55")),
      post(passenger, `/bookings/${booking.id}/arrive`, at("07:55")),
    ]);

    expect(replies.map((reply) => reply.status)).toEqual([200, 200]);
    const bodies = await Promise.all(replies.map((reply) => reply.json()));
    expect(bodies.map((body) => body.booking.outcome)).toEqual(["completed", "completed"]);
    expect(bodies.map((body) => body.booking.arrivedAt)).toEqual([
      "2026-10-19T12:55:00.000Z",
      "2026-10-19T12:55:00.000Z",
    ]);
  });
});

describe("POST /bookings/{id}/no-show", () => {
  it("lets the driver mark a passenger who did not show up 10 minutes after pickup", async () => {
    const { driver, booking } = await world();

    const reply = await post(driver, `/bookings/${booking.id}/no-show`, at("07:39"));

    expect(reply.status).toBe(200);
    expect(await reply.json()).toEqual({
      booking: {
        id: booking.id,
        tripDate: "2026-10-19",
        startedAt: null,
        arrivedAt: null,
        outcome: "no_show",
      },
      message: "Registramos que la persona no se presentó.",
    });
  });
});

describe("the time window for no-show", () => {
  it("is closed until 10 minutes after the pickup time", async () => {
    const { driver, booking } = await world();

    const reply = await post(driver, `/bookings/${booking.id}/no-show`, at("07:38"));

    expect(reply.status).toBe(409);
    const body = await reply.json();
    expect(body.error).toBe(
      "Podrás marcar que no se presentó 10 minutos después de la hora de recogida.",
    );
    expect(body.details.code).toBe("no_show_too_early");
  });
});

describe("who can mark a no-show", () => {
  it("lets only the driver of that trip do it, even for the passenger themself", async () => {
    const { org, passenger, booking } = await world();
    const stranger = await createMember(org.id, "stranger", "Otra Persona");

    for (const person of [passenger, stranger]) {
      const reply = await post(person, `/bookings/${booking.id}/no-show`, at("07:45"));
      expect(reply.status).toBe(404);
      expect((await reply.json()).details.code).toBe("booking_not_found");
    }
    expect(await progressesOf(passenger, at("07:00"))).toEqual(["not_started"]);
  });
});

describe("a no-show that makes no sense", () => {
  it("refuses a passenger already in the car, a completed trip and an unanswered request", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver", "Carlos Quispe Huamán");
    const aboard = await createMember(org.id, "aboard", "Ana Aboard");
    const arrived = await createMember(org.id, "arrived", "Eva Arrived");
    const waiting = await createMember(org.id, "waiting", "Rosa Waiting");
    const offer = await createOffer(org.id, driver.id, { date: TRIP_DAY });
    const started = await book(offer, aboard.id);
    const completed = await book(offer, arrived.id);
    const pending = await book(offer, waiting.id, { status: "pending" });
    await post(aboard, `/bookings/${started.id}/board`, at("07:00"));
    await post(arrived, `/bookings/${completed.id}/board`, at("07:00"));
    await post(arrived, `/bookings/${completed.id}/arrive`, at("07:50"));

    const codes = [];
    for (const booking of [started, completed, pending]) {
      const reply = await post(driver, `/bookings/${booking.id}/no-show`, at("08:00"));
      expect(reply.status).toBe(409);
      codes.push((await reply.json()).details.code);
    }

    expect(codes).toEqual([
      "booking_already_started",
      "booking_already_started",
      "booking_not_accepted",
    ]);
  });
});

async function progressesOf(person: { id: string }, now: Date) {
  const trips = await myTrips(person, "passenger", "upcoming", now);
  return trips.map((trip) => trip.progress);
}

async function myTrips(
  person: { id: string },
  role: "passenger" | "driver",
  scope: "upcoming" | "past",
  now: Date,
) {
  const reply = await appAt(person, now).request(`/me/trips?role=${role}&scope=${scope}`);
  return ((await reply.json()) as any).trips as Array<{
    id: string;
    status: string;
    progress: string | null;
    date: string | null;
  }>;
}

describe("my trips while the trip is under way", () => {
  it("keeps a started trip upcoming past its pickup time and says it is in progress", async () => {
    const { driver, passenger, offer, booking } = await world();
    await post(driver, `/offers/${offer.id}/start`, at("06:30"));

    const asPassenger = await myTrips(passenger, "passenger", "upcoming", at("07:45"));
    const asDriver = await myTrips(driver, "driver", "upcoming", at("07:45"));

    expect(asPassenger.map((trip) => [trip.id, trip.status, trip.progress])).toEqual([
      [booking.id, "accepted", "in_progress"],
    ]);
    expect(asDriver.map((trip) => [trip.id, trip.status, trip.progress])).toEqual([
      [offer.id, "active", "in_progress"],
    ]);
  });
});

describe("my trips once the trip is over", () => {
  it("moves a completed trip to the past as Completada and a no-show as No se presentó", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver", "Carlos Quispe Huamán");
    const rider = await createMember(org.id, "rider", "María Torres Rojas");
    const absent = await createMember(org.id, "absent", "Luis Ausente");
    const offer = await createOffer(org.id, driver.id, { date: TRIP_DAY });
    const ridden = await book(offer, rider.id);
    const missed = await book(offer, absent.id);
    await post(rider, `/bookings/${ridden.id}/board`, at("06:45"));
    await post(rider, `/bookings/${ridden.id}/arrive`, at("07:55"));
    await post(driver, `/bookings/${missed.id}/no-show`, at("07:45"));

    const upcoming = await myTrips(rider, "passenger", "upcoming", at("08:00"));
    const riderPast = await myTrips(rider, "passenger", "past", at("08:00"));
    const absentPast = await myTrips(absent, "passenger", "past", at("08:00"));

    expect(upcoming).toEqual([]);
    expect(riderPast.map((trip) => [trip.status, trip.progress])).toEqual([
      ["completed", "arrived"],
    ]);
    expect(absentPast.map((trip) => [trip.status, trip.progress])).toEqual([["no_show", null]]);
  });
});

describe("the community panel", () => {
  it("adds a verified trip once the passenger arrives, and not before", async () => {
    const { driver, passenger, offer, booking } = await world();
    const cache = new Map<string, unknown>();
    const panel = async (now: Date) => {
      const app = createApp({
        db: testDb as never,
        now: () => now,
        statsRateLimit: async () => ({ success: true, reset: 0 }),
        statsCache: {
          get: async () => null,
          set: async (key, value) => void cache.set(key, value),
        },
      });
      const reply = await app.request("/public/communities/alfa/stats");
      return ((await reply.json()) as any).vehicleImpact.verified.trips as number;
    };
    await post(driver, `/offers/${offer.id}/start`, at("06:30"));

    const whileTravelling = await panel(at("07:45"));
    await post(passenger, `/bookings/${booking.id}/arrive`, at("07:55"));
    const afterArriving = await panel(at("08:00"));

    expect([whileTravelling, afterArriving]).toEqual([0, 1]);
  });
});

describe("a weekly seat", () => {
  async function weeklyWorld() {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver", "Carlos Quispe Huamán", "Carlos Q.");
    const passenger = await createMember(org.id, "passenger", "María Torres Rojas", "Mari T.");
    const offer = await createOffer(org.id, driver.id, { daysOfWeek: [1] });
    const booking = await book(offer, passenger.id);
    return { driver, passenger, offer, booking };
  }

  it("travels again next week after arriving this week, and keeps this week as completed", async () => {
    const { driver, passenger, offer, booking } = await weeklyWorld();
    await post(driver, `/offers/${offer.id}/start`, atDay("2026-10-19", "06:30"));
    const week1 = await post(
      passenger,
      `/bookings/${booking.id}/arrive`,
      atDay("2026-10-19", "07:55"),
    );

    await post(driver, `/offers/${offer.id}/start`, atDay("2026-10-26", "06:30"));
    const week2 = await post(
      passenger,
      `/bookings/${booking.id}/arrive`,
      atDay("2026-10-26", "07:55"),
    );

    expect(week1.status).toBe(200);
    expect(week2.status).toBe(200);
    expect((await week2.json()).booking).toEqual({
      id: booking.id,
      tripDate: "2026-10-26",
      startedAt: "2026-10-26T11:30:00.000Z",
      arrivedAt: "2026-10-26T12:55:00.000Z",
      outcome: "completed",
    });
    const past = await myTrips(passenger, "passenger", "past", atDay("2026-10-26", "08:00"));
    expect(past.map((trip) => [trip.status, trip.date])).toEqual([
      ["completed", "2026-10-26"],
      ["completed", "2026-10-19"],
    ]);
    const upcoming = await myTrips(
      passenger,
      "passenger",
      "upcoming",
      atDay("2026-10-26", "08:00"),
    );
    expect(upcoming.map((trip) => [trip.status, trip.progress])).toEqual([["accepted", "arrived"]]);
  });

  it("keeps the seat for next week after a no-show this week", async () => {
    const { driver, passenger, offer, booking } = await weeklyWorld();
    const noShow = await post(
      driver,
      `/bookings/${booking.id}/no-show`,
      atDay("2026-10-19", "07:45"),
    );

    const nextWeek = await post(
      passenger,
      `/bookings/${booking.id}/board`,
      atDay("2026-10-26", "06:45"),
    );

    expect(noShow.status).toBe(200);
    expect(nextWeek.status).toBe(200);
    expect((await nextWeek.json()).booking.startedAt).toBe("2026-10-26T11:45:00.000Z");
    const past = await myTrips(passenger, "passenger", "past", atDay("2026-10-26", "07:00"));
    expect(past.map((trip) => [trip.status, trip.date])).toEqual([["no_show", "2026-10-19"]]);
    const upcoming = await myTrips(
      passenger,
      "passenger",
      "upcoming",
      atDay("2026-10-26", "07:00"),
    );
    expect(upcoming.map((trip) => [trip.status, trip.progress])).toEqual([
      ["accepted", "in_progress"],
    ]);
    expect(offer.id).toBeDefined();
  });
});

describe("the community panel with a weekly seat", () => {
  it("counts one verified trip for each day the same seat arrived", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver", "Carlos Quispe Huamán");
    const passenger = await createMember(org.id, "passenger", "María Torres Rojas");
    const offer = await createOffer(org.id, driver.id, { daysOfWeek: [1] });
    const booking = await book(offer, passenger.id);
    for (const day of ["2026-10-19", "2026-10-26"]) {
      await post(driver, `/offers/${offer.id}/start`, atDay(day, "06:30"));
      await post(passenger, `/bookings/${booking.id}/arrive`, atDay(day, "07:55"));
    }
    const app = createApp({
      db: testDb as never,
      now: () => atDay("2026-10-26", "08:00"),
      statsRateLimit: async () => ({ success: true, reset: 0 }),
      statsCache: { get: async () => null, set: async () => {} },
    });

    const reply = await app.request("/public/communities/alfa/stats");

    expect(((await reply.json()) as any).vehicleImpact.verified.trips).toBe(2);
  });
});

describe("a trip nobody can join", () => {
  it("refuses to start with no accepted passengers and invents no start time", async () => {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver", "Carlos Quispe Huamán");
    const waiting = await createMember(org.id, "waiting", "Ana Waiting");
    const offer = await createOffer(org.id, driver.id, { date: TRIP_DAY });
    await book(offer, waiting.id, { status: "pending" });

    const reply = await post(driver, `/offers/${offer.id}/start`, at("06:30"));

    expect(reply.status).toBe(409);
    const body = await reply.json();
    expect(body.error).toBe("Aún no tienes pasajeros aceptados para este viaje.");
    expect(body.details.code).toBe("no_accepted_passengers");
  });
});

describe("a passenger the driver marked as no-show", () => {
  it("cannot board that day any more", async () => {
    const { driver, passenger, booking } = await world();
    await post(driver, `/bookings/${booking.id}/no-show`, at("07:45"));

    const reply = await post(passenger, `/bookings/${booking.id}/board`, at("07:50"));

    expect(reply.status).toBe(409);
    expect((await reply.json()).details.code).toBe("booking_no_show");
  });
});

describe("a trip that leaves just after midnight", () => {
  async function nightWorld() {
    const org = await seedWorld();
    const driver = await createMember(org.id, "driver", "Carlos Quispe Huamán");
    const passenger = await createMember(org.id, "passenger", "María Torres Rojas");
    const offer = await createOffer(org.id, driver.id, {
      date: "2026-10-20",
      departureTime: "00:15",
    });
    await book(offer, passenger.id);
    return { driver, offer };
  }

  it("opens 30 minutes before, on the evening before", async () => {
    const { driver, offer } = await nightWorld();

    const early = await post(driver, `/offers/${offer.id}/start`, atDay("2026-10-19", "23:44"));
    const open = await post(driver, `/offers/${offer.id}/start`, atDay("2026-10-19", "23:45"));

    expect(early.status).toBe(409);
    expect((await early.json()).details.code).toBe("trip_too_early");
    expect(open.status).toBe(200);
    expect((await open.json()).tripDate).toBe("2026-10-20");
  });

  it("closes at the end of the trip day", async () => {
    const { driver, offer } = await nightWorld();

    const lastMinute = await post(
      driver,
      `/offers/${offer.id}/start`,
      atDay("2026-10-20", "23:59"),
    );
    const nextDay = await post(driver, `/offers/${offer.id}/start`, atDay("2026-10-21", "00:00"));

    expect(lastMinute.status).toBe(200);
    expect(nextDay.status).toBe(409);
    expect((await nextDay.json()).details.code).toBe("trip_not_today");
  });
});

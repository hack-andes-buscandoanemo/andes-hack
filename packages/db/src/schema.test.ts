import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  community,
  communityMember,
  meetingPoint,
  seatBooking,
  tripOffer,
  tripRequest,
  user,
  vehicle,
  zone,
} from "./schema";

const db = drizzle(new PGlite());

beforeAll(async () => {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)) });
});

afterAll(async () => {
  await db.$client.close();
});

// Every test shares the migrated database, so each fixture gets unique keys.
let sequence = 0;

async function first<T>(rows: Promise<T[]>) {
  const [row] = await rows;
  if (!row) throw new Error("Expected the write to return a row");
  return row;
}

async function givenCommunity(values: Partial<typeof community.$inferInsert> = {}) {
  sequence += 1;
  return first(
    db
      .insert(community)
      .values({
        slug: `comunidad-${sequence}`,
        name: `Comunidad ${sequence}`,
        kind: "company",
        destinationName: "Sede de prueba",
        destinationLat: -12.0975,
        destinationLng: -77.0356,
        ...values,
      })
      .returning(),
  );
}

async function givenMember(communityId: string) {
  sequence += 1;
  const person = await first(
    db
      .insert(user)
      .values({
        id: `user-${sequence}`,
        name: `Persona ${sequence}`,
        email: `persona-${sequence}@example.com`,
      })
      .returning(),
  );
  await db.insert(communityMember).values({
    communityId,
    userId: person.id,
    verificationMethod: "join_code",
  });
  return person;
}

async function givenMeetingPoint() {
  sequence += 1;
  const area = await first(
    db
      .insert(zone)
      .values({
        id: `zona-${sequence}`,
        name: `Zona ${sequence}`,
        district: "La Molina",
        lat: -12.0857,
        lng: -76.9719,
      })
      .returning(),
  );
  return first(
    db
      .insert(meetingPoint)
      .values({
        id: `punto-${sequence}`,
        zoneId: area.id,
        name: `Parque ${sequence}`,
        kind: "park",
        lat: -12.0861,
        lng: -76.9725,
        source: "OpenStreetMap",
      })
      .returning(),
  );
}

async function givenVehicle(ownerId: string, values: Partial<typeof vehicle.$inferInsert> = {}) {
  sequence += 1;
  return first(
    db
      .insert(vehicle)
      .values({
        ownerId,
        plate: `ABC${100 + sequence}`,
        make: "Toyota",
        model: "Yaris",
        color: "Gris",
        seats: 4,
        ...values,
      })
      .returning(),
  );
}

async function givenOffer(values: Partial<typeof tripOffer.$inferInsert> = {}) {
  const team = await givenCommunity();
  const driver = await givenMember(team.id);
  const point = await givenMeetingPoint();
  const car = await givenVehicle(driver.id);
  const offer = await first(
    db
      .insert(tripOffer)
      .values({
        communityId: team.id,
        driverId: driver.id,
        vehicleId: car.id,
        direction: "outbound",
        originZoneId: point.zoneId,
        departureTime: "07:00",
        daysOfWeek: [1, 2, 3, 4, 5],
        seatsTotal: 3,
        maxDetourMinutes: 5,
        ...values,
      })
      .returning(),
  );
  return { team, point, offer };
}

async function givenNeed(
  communityId: string,
  originZoneId: string,
  values: Partial<typeof tripRequest.$inferInsert> = {},
) {
  const passenger = await givenMember(communityId);
  const need = await first(
    db
      .insert(tripRequest)
      .values({
        communityId,
        passengerId: passenger.id,
        direction: "outbound",
        originZoneId,
        windowStart: "06:30",
        windowEnd: "07:30",
        daysOfWeek: [1, 3, 5],
        maxWalkMinutes: 10,
        fallbackMode: "drive_alone",
        ...values,
      })
      .returning(),
  );
  return { passenger, need };
}

// SQLSTATE codes from the PostgreSQL manual, appendix A.
const checkViolation = (constraint: string) => ({ cause: { code: "23514", constraint } });
const uniqueViolation = (constraint: string) => ({ cause: { code: "23505", constraint } });

describe("core domain schema on a freshly migrated database", () => {
  test("a passenger requests a seat on a driver's offer and the booking starts pending", async () => {
    const { team, point, offer } = await givenOffer({
      note: "Salgo puntual de la puerta del parque.",
    });
    const { passenger, need } = await givenNeed(team.id, point.zoneId);

    const booking = await first(
      db
        .insert(seatBooking)
        .values({
          offerId: offer.id,
          requestId: need.id,
          passengerId: passenger.id,
          meetingPointId: point.id,
          pickupAt: "07:05",
          detourMinutes: 4,
          walkMinutes: 6,
          message: "Llevo una mochila pequeña.",
        })
        .returning(),
    );

    expect(booking.status).toBe("pending");
  });
});

describe("unique keys", () => {
  test("rejects a second membership of the same person in the same community", async () => {
    const team = await givenCommunity();
    const person = await givenMember(team.id);

    await expect(
      db.insert(communityMember).values({
        communityId: team.id,
        userId: person.id,
        verificationMethod: "email_domain",
      }),
    ).rejects.toMatchObject(uniqueViolation("community_member_community_id_user_id_unique"));
  });

  test("rejects a second community with the same slug", async () => {
    const team = await givenCommunity();

    await expect(givenCommunity({ slug: team.slug })).rejects.toMatchObject(
      uniqueViolation("community_slug_unique"),
    );
  });

  test("rejects registering a plate that another vehicle already has", async () => {
    const team = await givenCommunity();
    const owner = await givenMember(team.id);
    const neighbour = await givenMember(team.id);
    const car = await givenVehicle(owner.id);

    await expect(givenVehicle(neighbour.id, { plate: car.plate })).rejects.toMatchObject(
      uniqueViolation("vehicle_plate_unique"),
    );
  });
});

describe("seats on an offer", () => {
  test("rejects taking a fourth seat on an offer with 3 of 3 seats taken", async () => {
    const { offer } = await givenOffer({ seatsTotal: 3, seatsTaken: 3 });

    await expect(
      db
        .update(tripOffer)
        .set({ seatsTaken: sql`${tripOffer.seatsTaken} + 1` })
        .where(eq(tripOffer.id, offer.id)),
    ).rejects.toMatchObject(checkViolation("trip_offer_seats_taken_check"));
  });

  test.each([0, 7])("rejects an offer of %i seats", async (seatsTotal) => {
    await expect(givenOffer({ seatsTotal })).rejects.toMatchObject(
      checkViolation("trip_offer_seats_total_check"),
    );
  });

  test.each([0, 7])("rejects a vehicle with %i passenger seats", async (seats) => {
    const team = await givenCommunity();
    const owner = await givenMember(team.id);

    await expect(givenVehicle(owner.id, { seats })).rejects.toMatchObject(
      checkViolation("vehicle_seats_check"),
    );
  });

  test.each([3, 15])("rejects a maximum detour of %i minutes", async (maxDetourMinutes) => {
    await expect(givenOffer({ maxDetourMinutes })).rejects.toMatchObject(
      checkViolation("trip_offer_max_detour_minutes_check"),
    );
  });

  test("rejects releasing a seat on an offer with no seats taken", async () => {
    const { offer } = await givenOffer({ seatsTotal: 3, seatsTaken: 0 });

    await expect(
      db
        .update(tripOffer)
        .set({ seatsTaken: sql`${tripOffer.seatsTaken} - 1` })
        .where(eq(tripOffer.id, offer.id)),
    ).rejects.toMatchObject(checkViolation("trip_offer_seats_taken_check"));
  });
});

describe("trip schedules", () => {
  const ambiguousSchedules = [
    { schedule: "both a date and weekdays", date: "2026-10-19", daysOfWeek: [1] },
    { schedule: "neither a date nor weekdays", date: null, daysOfWeek: null },
  ];

  test.each(ambiguousSchedules)("rejects an offer with $schedule", async ({ date, daysOfWeek }) => {
    await expect(givenOffer({ date, daysOfWeek })).rejects.toMatchObject(
      checkViolation("trip_offer_schedule_check"),
    );
  });

  const invalidWeekdays = [
    { days: "no weekdays", daysOfWeek: [] },
    { days: "weekday 0", daysOfWeek: [0] },
    { days: "weekday 8", daysOfWeek: [1, 8] },
  ];

  test.each(invalidWeekdays)("rejects an offer with $days", async ({ daysOfWeek }) => {
    await expect(givenOffer({ daysOfWeek })).rejects.toMatchObject(
      checkViolation("trip_offer_days_of_week_check"),
    );
  });

  test.each(ambiguousSchedules)("rejects a need with $schedule", async ({ date, daysOfWeek }) => {
    const team = await givenCommunity();
    const point = await givenMeetingPoint();

    await expect(givenNeed(team.id, point.zoneId, { date, daysOfWeek })).rejects.toMatchObject(
      checkViolation("trip_request_schedule_check"),
    );
  });

  test.each(invalidWeekdays)("rejects a need with $days", async ({ daysOfWeek }) => {
    const team = await givenCommunity();
    const point = await givenMeetingPoint();

    await expect(givenNeed(team.id, point.zoneId, { daysOfWeek })).rejects.toMatchObject(
      checkViolation("trip_request_days_of_week_check"),
    );
  });
});

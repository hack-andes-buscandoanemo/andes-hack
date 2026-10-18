import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
  const org = await givenCommunity();
  const driver = await givenMember(org.id);
  const point = await givenMeetingPoint();
  const car = await givenVehicle(driver.id);
  const offer = await first(
    db
      .insert(tripOffer)
      .values({
        communityId: org.id,
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
  return { org, point, offer };
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

async function givenPassengerForOffer() {
  const { org, point, offer } = await givenOffer();
  const { passenger, need } = await givenNeed(org.id, point.zoneId);
  return {
    offerId: offer.id,
    requestId: need.id,
    passengerId: passenger.id,
    meetingPointId: point.id,
  };
}

type SeatRequest = Pick<
  typeof seatBooking.$inferInsert,
  "offerId" | "requestId" | "passengerId" | "meetingPointId"
> &
  Partial<typeof seatBooking.$inferInsert>;

function requestSeat(seat: SeatRequest) {
  return first(
    db
      .insert(seatBooking)
      .values({ pickupAt: "07:05", detourMinutes: 4, walkMinutes: 6, ...seat })
      .returning(),
  );
}

// SQLSTATE codes from the PostgreSQL manual, appendix A.
const checkViolation = (constraint: string) => ({ cause: { code: "23514", constraint } });
const uniqueViolation = (constraint: string) => ({ cause: { code: "23505", constraint } });

describe("core domain schema on a freshly migrated database", () => {
  it("a passenger requests a seat on a driver's offer and the booking starts pending", async () => {
    const { org, point, offer } = await givenOffer({
      note: "Salgo puntual de la puerta del parque.",
    });
    const { passenger, need } = await givenNeed(org.id, point.zoneId);

    const booking = await requestSeat({
      offerId: offer.id,
      requestId: need.id,
      passengerId: passenger.id,
      meetingPointId: point.id,
      message: "Llevo una mochila pequeña.",
    });

    expect(booking.status).toBe("pending");
  });
});

describe("active seat bookings", () => {
  it("rejects a second request from the same passenger while the first is pending", async () => {
    const seat = await givenPassengerForOffer();
    await requestSeat(seat);

    await expect(requestSeat(seat)).rejects.toMatchObject(
      uniqueViolation("seat_booking_active_passenger_idx"),
    );
  });

  it.each(["rejected", "cancelled_by_passenger", "cancelled_by_driver"] as const)(
    "lets the passenger request the offer again after a %s booking",
    async (status) => {
      const seat = await givenPassengerForOffer();
      const earlier = await requestSeat(seat);
      await db.update(seatBooking).set({ status }).where(eq(seatBooking.id, earlier.id));

      const retry = await requestSeat(seat);

      expect(retry.status).toBe("pending");
    },
  );

  it("rejects a new request from a passenger the driver already accepted", async () => {
    const seat = await givenPassengerForOffer();
    const earlier = await requestSeat(seat);
    await db.update(seatBooking).set({ status: "accepted" }).where(eq(seatBooking.id, earlier.id));

    await expect(requestSeat(seat)).rejects.toMatchObject(
      uniqueViolation("seat_booking_active_passenger_idx"),
    );
  });
});

describe("unique keys", () => {
  it("rejects a second membership of the same person in the same community", async () => {
    const org = await givenCommunity();
    const person = await givenMember(org.id);

    await expect(
      db.insert(communityMember).values({
        communityId: org.id,
        userId: person.id,
        verificationMethod: "email_domain",
      }),
    ).rejects.toMatchObject(uniqueViolation("community_member_community_id_user_id_unique"));
  });

  it("rejects a second community with the same slug", async () => {
    const org = await givenCommunity();

    await expect(givenCommunity({ slug: org.slug })).rejects.toMatchObject(
      uniqueViolation("community_slug_unique"),
    );
  });

  it("rejects registering a plate that another vehicle already has", async () => {
    const org = await givenCommunity();
    const owner = await givenMember(org.id);
    const neighbour = await givenMember(org.id);
    const car = await givenVehicle(owner.id);

    await expect(givenVehicle(neighbour.id, { plate: car.plate })).rejects.toMatchObject(
      uniqueViolation("vehicle_plate_unique"),
    );
  });

  it.each(["abc123", "ABC 123"])("rejects the non-normalised plate %s", async (plate) => {
    const org = await givenCommunity();
    const owner = await givenMember(org.id);

    await expect(givenVehicle(owner.id, { plate })).rejects.toMatchObject(
      checkViolation("vehicle_plate_normalized_check"),
    );
  });

  it("accepts a plate written like ABC-123", async () => {
    const org = await givenCommunity();
    const owner = await givenMember(org.id);

    await expect(givenVehicle(owner.id, { plate: "ABC-123" })).resolves.toMatchObject({
      plate: "ABC-123",
    });
  });
});

describe("seat and detour limits", () => {
  it("rejects taking a fourth seat on an offer with 3 of 3 seats taken", async () => {
    const { offer } = await givenOffer({ seatsTotal: 3, seatsTaken: 3 });

    await expect(
      db
        .update(tripOffer)
        .set({ seatsTaken: sql`${tripOffer.seatsTaken} + 1` })
        .where(eq(tripOffer.id, offer.id)),
    ).rejects.toMatchObject(checkViolation("trip_offer_seats_taken_check"));
  });

  it.each([0, 7])("rejects an offer of %i seats", async (seatsTotal) => {
    await expect(givenOffer({ seatsTotal })).rejects.toMatchObject(
      checkViolation("trip_offer_seats_total_check"),
    );
  });

  it.each([1, 6])("accepts an offer at the %i-seat limit", async (seatsTotal) => {
    await expect(givenOffer({ seatsTotal })).resolves.toMatchObject({ offer: { seatsTotal } });
  });

  it.each([0, 7])("rejects a vehicle with %i passenger seats", async (seats) => {
    const org = await givenCommunity();
    const owner = await givenMember(org.id);

    await expect(givenVehicle(owner.id, { seats })).rejects.toMatchObject(
      checkViolation("vehicle_seats_check"),
    );
  });

  it.each([1, 6])("accepts a vehicle at the %i-seat limit", async (seats) => {
    const org = await givenCommunity();
    const owner = await givenMember(org.id);

    await expect(givenVehicle(owner.id, { seats })).resolves.toMatchObject({ seats });
  });

  it.each([3, 15])("rejects a maximum detour of %i minutes", async (maxDetourMinutes) => {
    await expect(givenOffer({ maxDetourMinutes })).rejects.toMatchObject(
      checkViolation("trip_offer_max_detour_minutes_check"),
    );
  });

  it.each([0, 10])("accepts a maximum detour of %i minutes", async (maxDetourMinutes) => {
    await expect(givenOffer({ maxDetourMinutes })).resolves.toMatchObject({
      offer: { maxDetourMinutes },
    });
  });

  it("rejects releasing a seat on an offer with no seats taken", async () => {
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

  it.each(ambiguousSchedules)("rejects an offer with $schedule", async ({ date, daysOfWeek }) => {
    await expect(givenOffer({ date, daysOfWeek })).rejects.toMatchObject(
      checkViolation("trip_offer_schedule_check"),
    );
  });

  const invalidWeekdays = [
    { days: "no weekdays", daysOfWeek: [] },
    { days: "weekday 0", daysOfWeek: [0] },
    { days: "weekday 8", daysOfWeek: [1, 8] },
  ];

  it.each(invalidWeekdays)("rejects an offer with $days", async ({ daysOfWeek }) => {
    await expect(givenOffer({ daysOfWeek })).rejects.toMatchObject(
      checkViolation("trip_offer_days_of_week_check"),
    );
  });

  it.each(ambiguousSchedules)("rejects a need with $schedule", async ({ date, daysOfWeek }) => {
    const org = await givenCommunity();
    const point = await givenMeetingPoint();

    await expect(givenNeed(org.id, point.zoneId, { date, daysOfWeek })).rejects.toMatchObject(
      checkViolation("trip_request_schedule_check"),
    );
  });

  it.each(invalidWeekdays)("rejects a need with $days", async ({ daysOfWeek }) => {
    const org = await givenCommunity();
    const point = await givenMeetingPoint();

    await expect(givenNeed(org.id, point.zoneId, { daysOfWeek })).rejects.toMatchObject(
      checkViolation("trip_request_days_of_week_check"),
    );
  });

  const validSchedules = [
    { schedule: "a single date", date: "2026-10-19", daysOfWeek: null },
    { schedule: "Sundays only", date: null, daysOfWeek: [7] },
    { schedule: "every day of the week", date: null, daysOfWeek: [1, 2, 3, 4, 5, 6, 7] },
  ];

  it.each(validSchedules)("accepts an offer on $schedule", async ({ date, daysOfWeek }) => {
    await expect(givenOffer({ date, daysOfWeek })).resolves.toMatchObject({
      offer: { date, daysOfWeek },
    });
  });

  it.each(validSchedules)("accepts a need on $schedule", async ({ date, daysOfWeek }) => {
    const org = await givenCommunity();
    const point = await givenMeetingPoint();

    await expect(givenNeed(org.id, point.zoneId, { date, daysOfWeek })).resolves.toMatchObject({
      need: { date, daysOfWeek },
    });
  });
});

import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  community,
  communityMember,
  matchRun,
  matchSuggestion,
  meetingPoint,
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

let sequence = 0;

async function first<T>(rows: Promise<T[]>) {
  const [row] = await rows;
  if (!row) throw new Error("Expected the write to return a row");
  return row;
}

async function givenMember(communityId: string, role: "member" | "admin" = "member") {
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
    role,
    verificationMethod: "join_code",
  });
  return person;
}

// A community with one driver's offer, one passenger's need and the meeting point between them.
async function givenDay() {
  sequence += 1;
  const org = await first(
    db
      .insert(community)
      .values({
        slug: `comunidad-${sequence}`,
        name: `Comunidad ${sequence}`,
        kind: "company",
        destinationName: "Sede de prueba",
        destinationLat: -12.0975,
        destinationLng: -77.0356,
      })
      .returning(),
  );
  const admin = await givenMember(org.id, "admin");
  const driver = await givenMember(org.id);
  const passenger = await givenMember(org.id);
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
  const point = await first(
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
  const car = await first(
    db
      .insert(vehicle)
      .values({
        ownerId: driver.id,
        plate: `ABC${100 + sequence}`,
        make: "Toyota",
        model: "Yaris",
        color: "Gris",
        seats: 4,
      })
      .returning(),
  );
  const offer = await first(
    db
      .insert(tripOffer)
      .values({
        communityId: org.id,
        driverId: driver.id,
        vehicleId: car.id,
        direction: "outbound",
        originZoneId: area.id,
        departureTime: "07:00",
        daysOfWeek: [1, 2, 3, 4, 5],
        seatsTotal: 3,
        maxDetourMinutes: 10,
      })
      .returning(),
  );
  const need = await first(
    db
      .insert(tripRequest)
      .values({
        communityId: org.id,
        passengerId: passenger.id,
        direction: "outbound",
        originZoneId: area.id,
        windowStart: "07:30",
        windowEnd: "08:00",
        daysOfWeek: [1, 3],
        maxWalkMinutes: 10,
        fallbackMode: "drive_alone",
      })
      .returning(),
  );
  return { org, admin, driver, passenger, point, offer, need };
}

async function givenRun(
  day: Awaited<ReturnType<typeof givenDay>>,
  algorithm: "fcfs" | "optimizer" = "optimizer",
) {
  return first(
    db
      .insert(matchRun)
      .values({
        communityId: day.org.id,
        direction: "outbound",
        date: "2026-10-19",
        algorithm,
        inputSummary: { offers: 1, requests: 1 },
        metrics: {
          carTripsAvoided: 1,
          passengersMatched: 1,
          detourMinutes: 4,
          walkMinutes: 6,
          unassigned: 0,
        },
        durationMs: 12,
        runBy: day.admin.id,
      })
      .returning(),
  );
}

function suggestionOf(day: Awaited<ReturnType<typeof givenDay>>, runId: string) {
  return {
    runId,
    offerId: day.offer.id,
    requestId: day.need.id,
    passengerId: day.passenger.id,
    meetingPointId: day.point.id,
    position: 0,
    pickupAt: "07:12",
    arrivalAt: "07:41",
    detourMinutes: 4,
    walkMinutes: 6,
    avoidsCarTrip: true,
  };
}

const uniqueViolation = (constraint: string) => ({ cause: { code: "23505", constraint } });

describe("match runs on a freshly migrated database", () => {
  it("stores a run of each algorithm for the same day and its suggestions start proposed", async () => {
    const day = await givenDay();
    const optimizer = await givenRun(day, "optimizer");
    const fcfs = await givenRun(day, "fcfs");

    const suggestion = await first(
      db.insert(matchSuggestion).values(suggestionOf(day, optimizer.id)).returning(),
    );

    expect(suggestion.status).toBe("proposed");
    expect(fcfs.algorithm).toBe("fcfs");
    expect(optimizer.metrics).toEqual({
      carTripsAvoided: 1,
      passengersMatched: 1,
      detourMinutes: 4,
      walkMinutes: 6,
      unassigned: 0,
    });
  });

  it("gives a need at most one suggestion per run", async () => {
    const day = await givenDay();
    const run = await givenRun(day);
    await db.insert(matchSuggestion).values(suggestionOf(day, run.id));

    await expect(
      db.insert(matchSuggestion).values(suggestionOf(day, run.id)),
    ).rejects.toMatchObject(uniqueViolation("match_suggestion_run_id_request_id_unique"));
  });

  it("drops the suggestions with their run and keeps the run when the admin's account goes", async () => {
    const day = await givenDay();
    const run = await givenRun(day);
    await db.insert(matchSuggestion).values(suggestionOf(day, run.id));

    await db.delete(user).where(eq(user.id, day.admin.id));
    const [kept] = await db.select().from(matchRun).where(eq(matchRun.id, run.id));
    await db.delete(matchRun).where(eq(matchRun.id, run.id));
    const left = await db.select().from(matchSuggestion).where(eq(matchSuggestion.runId, run.id));

    expect(kept?.runBy).toBeNull();
    expect(left).toEqual([]);
  });
});

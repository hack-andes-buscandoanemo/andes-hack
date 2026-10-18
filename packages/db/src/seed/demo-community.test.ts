import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
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
} from "../schema";
import { type SeedReport, seedDemoCommunity } from "./demo-community";

const config = { joinCode: "ALFA-DEMO-2026", adminEmail: "equipo@te-jalo.example" };

// The size of US-015's places.json: update it when the places change.
const placesJson = { zones: 25, meetingPoints: 50 };

// Each scenario runs on its own freshly migrated database.
function migratedDatabase() {
  const db = drizzle(new PGlite());
  beforeAll(async () => {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
    });
  }, 30_000);
  afterAll(async () => {
    await db.$client.close();
  });
  return db;
}

type Database = ReturnType<typeof migratedDatabase>;

async function comunidadAlfa(db: Database) {
  const [alfa] = await db.select().from(community).where(eq(community.slug, "comunidad-alfa"));
  if (!alfa) throw new Error("Expected the seed to create Comunidad Alfa");
  return alfa;
}

// better-auth stores the email of every account it signs up in lower case.
function givenTeamAdminAccount(db: Database, email = config.adminEmail) {
  return db.insert(user).values({ id: "team-admin", name: "Equipo", email });
}

describe("seeding a freshly migrated database", () => {
  const db = migratedDatabase();
  let report: SeedReport;

  beforeAll(async () => {
    report = await seedDemoCommunity(db, config);
  });

  it("reports how many rows it created in each table", () => {
    expect(report.tables).toEqual({
      zone: { created: placesJson.zones, updated: 0 },
      meeting_point: { created: placesJson.meetingPoints, updated: 0 },
      community: { created: 1, updated: 0 },
    });
  });

  it("reports that the team admin has no account yet", () => {
    expect(report.admin).toBe("missing_account");
  });

  it("creates Comunidad Alfa, a company community for real users going to the Centro Empresarial Real", async () => {
    expect(await comunidadAlfa(db)).toMatchObject({
      name: "Comunidad Alfa",
      kind: "company",
      isDemo: false,
      destinationName: "Centro Empresarial Real",
      destinationLat: -12.0975459,
      destinationLng: -77.0375707,
    });
  });

  it("stores the join code only as its SHA-256 hash", async () => {
    expect((await comunidadAlfa(db)).joinCodeHash).toBe(
      "e3970185928404994cb32a5ecd3d7f44d991b1695d9abc24d588aae916d310ec",
    );
  });

  it("loads every zone and meeting point of places.json", async () => {
    expect([await db.$count(zone), await db.$count(meetingPoint)]).toEqual([
      placesJson.zones,
      placesJson.meetingPoints,
    ]);
  });

  it("keeps where each meeting point comes from and when it was read", async () => {
    const [kennedy] = await db
      .select()
      .from(meetingPoint)
      .where(eq(meetingPoint.id, "miraflores-parque-kennedy"));

    expect(kennedy).toEqual({
      id: "miraflores-parque-kennedy",
      zoneId: "miraflores",
      name: "Parque Kennedy",
      kind: "park",
      lat: -12.1217806,
      lng: -77.0304221,
      source: "OpenStreetMap way/28798160 (2026-10-17)",
    });
  });
});

// What real people leave behind after using the app for a while: they joined, offered a
// ride, asked for one and requested a seat.
async function givenRealUsersOfComunidadAlfa(db: Database) {
  const alfa = await comunidadAlfa(db);
  await db.insert(user).values([
    { id: "real-driver", name: "Conductora Real", email: "conductora@example.com" },
    { id: "real-passenger", name: "Pasajero Real", email: "pasajero@example.com" },
  ]);
  await db.insert(communityMember).values([
    { communityId: alfa.id, userId: "real-driver", verificationMethod: "join_code", alias: "Ana" },
    { communityId: alfa.id, userId: "real-passenger", verificationMethod: "join_code" },
  ]);
  const [car] = await db
    .insert(vehicle)
    .values({
      ownerId: "real-driver",
      plate: "ABC-123",
      make: "Kia",
      model: "Rio",
      color: "Rojo",
      seats: 4,
    })
    .returning();
  const [offer] = await db
    .insert(tripOffer)
    .values({
      communityId: alfa.id,
      driverId: "real-driver",
      vehicleId: car?.id,
      direction: "outbound",
      originZoneId: "la-molina",
      departureTime: "07:00",
      daysOfWeek: [1, 2, 3, 4, 5],
      seatsTotal: 3,
      maxDetourMinutes: 5,
    })
    .returning();
  const [need] = await db
    .insert(tripRequest)
    .values({
      communityId: alfa.id,
      passengerId: "real-passenger",
      direction: "outbound",
      originZoneId: "la-molina",
      windowStart: "07:30",
      windowEnd: "08:00",
      daysOfWeek: [1, 3, 5],
      maxWalkMinutes: 10,
      fallbackMode: "drive_alone",
    })
    .returning();
  if (!offer || !need) throw new Error("Expected the real trips to be saved");
  await db.insert(seatBooking).values({
    offerId: offer.id,
    requestId: need.id,
    passengerId: "real-passenger",
    meetingPointId: "la-molina-plaza-de-armas",
    pickupAt: "07:05",
    detourMinutes: 3,
    walkMinutes: 4,
  });
}

async function everythingRealUsersCreated(db: Database) {
  return {
    users: await db.select().from(user),
    memberships: await db.select().from(communityMember),
    vehicles: await db.select().from(vehicle),
    offers: await db.select().from(tripOffer),
    needs: await db.select().from(tripRequest),
    bookings: await db.select().from(seatBooking),
  };
}

describe("seeding a database that was already seeded", () => {
  const db = migratedDatabase();
  let second: SeedReport;
  let realUsersBefore: Awaited<ReturnType<typeof everythingRealUsersCreated>>;

  beforeAll(async () => {
    await seedDemoCommunity(db, config);
    await givenRealUsersOfComunidadAlfa(db);
    realUsersBefore = await everythingRealUsersCreated(db);
    second = await seedDemoCommunity(db, config);
  });

  it("leaves what real users created exactly as it was", async () => {
    expect(await everythingRealUsersCreated(db)).toEqual(realUsersBefore);
  });

  it("reports that it created nothing and updated the rows already there", () => {
    expect(second.tables).toEqual({
      zone: { created: 0, updated: placesJson.zones },
      meeting_point: { created: 0, updated: placesJson.meetingPoints },
      community: { created: 0, updated: 1 },
    });
  });

  it("does not duplicate any row", async () => {
    const rows = {
      zone: await db.$count(zone),
      meeting_point: await db.$count(meetingPoint),
      community: await db.$count(community),
    };

    expect(rows).toEqual({
      zone: placesJson.zones,
      meeting_point: placesJson.meetingPoints,
      community: 1,
    });
  });
});

describe("seeding once the team admin has signed up", () => {
  const db = migratedDatabase();
  let report: SeedReport;

  beforeAll(async () => {
    await givenTeamAdminAccount(db);
    report = await seedDemoCommunity(db, config);
  });

  it("makes that account an admin of Comunidad Alfa, counted as part of the team", async () => {
    const [membership] = await db
      .select({
        community: community.slug,
        role: communityMember.role,
        isTeam: communityMember.isTeam,
      })
      .from(communityMember)
      .innerJoin(community, eq(community.id, communityMember.communityId))
      .where(eq(communityMember.userId, "team-admin"));

    expect({ admin: report.admin, membership }).toEqual({
      admin: "promoted",
      membership: { community: "comunidad-alfa", role: "admin", isTeam: true },
    });
  });
});

describe("seeding with the admin email written in capitals", () => {
  const db = migratedDatabase();
  let report: SeedReport;

  beforeAll(async () => {
    await givenTeamAdminAccount(db, "equipo@te-jalo.example");
    report = await seedDemoCommunity(db, { ...config, adminEmail: "Equipo@Te-Jalo.example" });
  });

  it("still finds that account and promotes it", () => {
    expect(report.admin).toBe("promoted");
  });
});

describe("seeding after the team admin joined as a regular member", () => {
  const db = migratedDatabase();

  beforeAll(async () => {
    await seedDemoCommunity(db, config);
    const alfa = await comunidadAlfa(db);
    await givenTeamAdminAccount(db);
    await db.insert(communityMember).values({
      communityId: alfa.id,
      userId: "team-admin",
      verificationMethod: "email_domain",
      alias: "Dani",
      usualMode: "drove_alone",
      consentVersion: "2026-10",
    });
    await seedDemoCommunity(db, config);
  });

  it("promotes them and keeps the rest of their membership", async () => {
    const [membership] = await db
      .select()
      .from(communityMember)
      .where(eq(communityMember.userId, "team-admin"));

    expect(membership).toMatchObject({
      role: "admin",
      isTeam: true,
      verificationMethod: "email_domain",
      alias: "Dani",
      usualMode: "drove_alone",
      consentVersion: "2026-10",
    });
  });
});

describe("seeding again with a new join code", () => {
  const db = migratedDatabase();

  beforeAll(async () => {
    await seedDemoCommunity(db, config);
    await seedDemoCommunity(db, { ...config, joinCode: "ALFA-DEMO-2027" });
  });

  it("replaces the stored hash, so only the new code lets people join", async () => {
    expect((await comunidadAlfa(db)).joinCodeHash).toBe(
      "77221cd9b3eaf5fe49a0cee3bdc2a7d2ee30589136adb5c6f1f639a2ded7a11c",
    );
  });
});

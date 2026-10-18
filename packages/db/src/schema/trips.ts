import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps } from "./columns";
import { community } from "./community";
import { meetingPoint, zone } from "./places";
import { vehicle } from "./vehicle";

// Times of day are local to America/Lima (UTC−5, no daylight saving time).
// People references become null when the account is deleted (US-029), so the
// historical counters keep the trip without knowing who made it.

// `outbound` goes to the community's destination; `return` comes back from it.
export const tripDirectionEnum = pgEnum("trip_direction", ["outbound", "return"]);

export const offerStatusEnum = pgEnum("offer_status", ["active", "paused", "cancelled"]);

export const fallbackModeEnum = pgEnum("fallback_mode", [
  "drive_alone",
  "taxi_app",
  "public_transport",
  "picked_up",
  "other",
]);

export const requestStatusEnum = pgEnum("request_status", ["open", "matched", "cancelled"]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "accepted",
  "rejected",
  "cancelled_by_passenger",
  "cancelled_by_driver",
  "completed",
  "no_show",
]);

export const tripOffer = pgTable(
  "trip_offer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => community.id, { onDelete: "cascade" }),
    driverId: text("driver_id").references(() => user.id, { onDelete: "set null" }),
    vehicleId: uuid("vehicle_id").references(() => vehicle.id, { onDelete: "set null" }),
    direction: tripDirectionEnum("direction").notNull(),
    // The zone at the member's end of the trip: departure on `outbound`, arrival on `return`.
    originZoneId: text("origin_zone_id")
      .notNull()
      .references(() => zone.id, { onDelete: "restrict" }),
    departureTime: time("departure_time").notNull(),
    daysOfWeek: smallint("days_of_week").array(),
    date: date("date"),
    seatsTotal: smallint("seats_total").notNull(),
    seatsTaken: smallint("seats_taken").default(0).notNull(),
    maxDetourMinutes: smallint("max_detour_minutes").notNull(),
    womenOnly: boolean("women_only").default(false).notNull(),
    note: varchar("note", { length: 280 }),
    status: offerStatusEnum("status").default("active").notNull(),
    ...timestamps,
  },
  (table) => [
    index("trip_offer_community_id_idx").on(table.communityId),
    index("trip_offer_driver_id_idx").on(table.driverId),
    check("trip_offer_seats_total_check", sql`${table.seatsTotal} BETWEEN 1 AND 6`),
    check("trip_offer_max_detour_minutes_check", sql`${table.maxDetourMinutes} IN (0, 5, 10)`),
    // A trip happens on one date or every week on some weekdays, never both.
    check(
      "trip_offer_schedule_check",
      sql`(${table.date} IS NULL) <> (${table.daysOfWeek} IS NULL)`,
    ),
    check(
      "trip_offer_seats_taken_check",
      sql`${table.seatsTaken} BETWEEN 0 AND ${table.seatsTotal}`,
    ),
  ],
);

export const tripRequest = pgTable(
  "trip_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => community.id, { onDelete: "cascade" }),
    passengerId: text("passenger_id").references(() => user.id, { onDelete: "set null" }),
    direction: tripDirectionEnum("direction").notNull(),
    originZoneId: text("origin_zone_id")
      .notNull()
      .references(() => zone.id, { onDelete: "restrict" }),
    windowStart: time("window_start").notNull(),
    windowEnd: time("window_end").notNull(),
    daysOfWeek: smallint("days_of_week").array(),
    date: date("date"),
    maxWalkMinutes: smallint("max_walk_minutes").notNull(),
    fallbackMode: fallbackModeEnum("fallback_mode").notNull(),
    status: requestStatusEnum("status").default("open").notNull(),
    ...timestamps,
  },
  (table) => [
    index("trip_request_community_id_idx").on(table.communityId),
    index("trip_request_passenger_id_idx").on(table.passengerId),
    check(
      "trip_request_schedule_check",
      sql`(${table.date} IS NULL) <> (${table.daysOfWeek} IS NULL)`,
    ),
  ],
);

export const seatBooking = pgTable(
  "seat_booking",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    offerId: uuid("offer_id")
      .notNull()
      .references(() => tripOffer.id, { onDelete: "cascade" }),
    requestId: uuid("request_id")
      .notNull()
      .references(() => tripRequest.id, { onDelete: "cascade" }),
    passengerId: text("passenger_id").references(() => user.id, { onDelete: "set null" }),
    meetingPointId: text("meeting_point_id")
      .notNull()
      .references(() => meetingPoint.id, { onDelete: "restrict" }),
    pickupAt: time("pickup_at").notNull(),
    detourMinutes: smallint("detour_minutes").notNull(),
    walkMinutes: smallint("walk_minutes").notNull(),
    message: varchar("message", { length: 280 }),
    status: bookingStatusEnum("status").default("pending").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("seat_booking_offer_id_idx").on(table.offerId),
    index("seat_booking_passenger_id_idx").on(table.passengerId),
  ],
);

export type TripOffer = typeof tripOffer.$inferSelect;
export type TripRequest = typeof tripRequest.$inferSelect;
export type SeatBooking = typeof seatBooking.$inferSelect;

import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { community } from "./community";
import { meetingPoint } from "./places";
import { tripDirectionEnum, tripOffer, tripRequest } from "./trips";

// One execution of the matching engine over a journey: a community's offers and needs in
// one direction on one date (US-019). Both algorithms run on the same input so the panel
// compares them; their suggestions are recommendations each driver still accepts or rejects.

export const matchAlgorithmEnum = pgEnum("match_algorithm", ["fcfs", "optimizer"]);

// A suggestion is proposed until the driver decides on the seat (US-020) or a later run
// replaces it. An accepted one survives later runs: the seat is already taken.
export const matchSuggestionStatusEnum = pgEnum("match_suggestion_status", [
  "proposed",
  "accepted",
  "rejected",
]);

// How many offers and needs the run read.
export interface MatchRunInput {
  offers: number;
  requests: number;
}

// The plan's objective plus how many needs got no seat, as optimizeDay reports them.
export interface MatchRunMetrics {
  carTripsAvoided: number;
  passengersMatched: number;
  detourMinutes: number;
  walkMinutes: number;
  unassigned: number;
}

export const matchRun = pgTable(
  "match_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => community.id, { onDelete: "cascade" }),
    direction: tripDirectionEnum("direction").notNull(),
    date: date("date").notNull(),
    algorithm: matchAlgorithmEnum("algorithm").notNull(),
    inputSummary: jsonb("input_summary").$type<MatchRunInput>().notNull(),
    metrics: jsonb("metrics").$type<MatchRunMetrics>().notNull(),
    durationMs: integer("duration_ms").notNull(),
    // Null once the admin's account is deleted (US-029); the run stays as history.
    runBy: text("run_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("match_run_journey_idx").on(table.communityId, table.direction, table.date)],
);

export const matchSuggestion = pgTable(
  "match_suggestion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => matchRun.id, { onDelete: "cascade" }),
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
    // Index of the stop among all the driver's passengers, accepted ones included.
    position: smallint("position").notNull(),
    pickupAt: time("pickup_at").notNull(),
    arrivalAt: time("arrival_at").notNull(),
    detourMinutes: smallint("detour_minutes").notNull(),
    walkMinutes: smallint("walk_minutes").notNull(),
    avoidsCarTrip: boolean("avoids_car_trip").notNull(),
    status: matchSuggestionStatusEnum("status").default("proposed").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // A run seats each need once.
    unique("match_suggestion_run_id_request_id_unique").on(table.runId, table.requestId),
    index("match_suggestion_offer_id_idx").on(table.offerId),
    index("match_suggestion_passenger_id_idx").on(table.passengerId),
  ],
);

export type MatchRun = typeof matchRun.$inferSelect;
export type MatchSuggestion = typeof matchSuggestion.$inferSelect;

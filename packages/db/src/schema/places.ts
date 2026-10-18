import { doublePrecision, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

// Coordinates only describe zones, public meeting points and a community's destination:
// no column stores a person's exact address. Zones and meeting points use stable slugs as
// ids so they match the engine's places.json (US-015).

export const meetingPointKindEnum = pgEnum("meeting_point_kind", [
  "park",
  "mall",
  "rail_station",
  "bus_stop",
  "venue",
  "other",
]);

export const zone = pgTable("zone", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  district: text("district").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
});

export const meetingPoint = pgTable("meeting_point", {
  id: text("id").primaryKey(),
  zoneId: text("zone_id")
    .notNull()
    .references(() => zone.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  kind: meetingPointKindEnum("kind").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  source: text("source").notNull(),
});

export type Zone = typeof zone.$inferSelect;
export type MeetingPoint = typeof meetingPoint.$inferSelect;

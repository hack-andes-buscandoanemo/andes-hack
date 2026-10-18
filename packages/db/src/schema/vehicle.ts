import { sql } from "drizzle-orm";
import { check, index, pgTable, smallint, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps } from "./columns";

export const vehicle = pgTable(
  "vehicle",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Normalised by the API before it is stored (US-012): upper case, no spaces. The format
    // itself (ABC-123) is validated there; the database only refuses what is not normalised.
    plate: text("plate").notNull().unique(),
    make: text("make").notNull(),
    model: text("model").notNull(),
    color: text("color").notNull(),
    seats: smallint("seats").notNull(),
    ...timestamps,
  },
  (table) => [
    index("vehicle_owner_id_idx").on(table.ownerId),
    check("vehicle_seats_check", sql`${table.seats} BETWEEN 1 AND 6`),
    check(
      "vehicle_plate_normalized_check",
      sql`${table.plate} = upper(${table.plate}) AND ${table.plate} !~ '[[:space:]]'`,
    ),
  ],
);

export type Vehicle = typeof vehicle.$inferSelect;

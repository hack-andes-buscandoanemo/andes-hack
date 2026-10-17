import { index, pgTable, smallint, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps } from "./columns";

export const vehicle = pgTable(
  "vehicle",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    plate: text("plate").notNull(),
    make: text("make").notNull(),
    model: text("model").notNull(),
    color: text("color").notNull(),
    seats: smallint("seats").notNull(),
    ...timestamps,
  },
  (table) => [index("vehicle_owner_id_idx").on(table.ownerId)],
);

export type Vehicle = typeof vehicle.$inferSelect;

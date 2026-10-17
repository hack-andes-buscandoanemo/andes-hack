import { timestamp } from "drizzle-orm/pg-core";

// Domain instants carry their time zone, so server-side defaults never depend on the session zone.
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
};

import { boolean, index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const task = pgTable(
  "task",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    completed: boolean("completed").default(false).notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("task_user_id_idx").on(table.userId)],
);

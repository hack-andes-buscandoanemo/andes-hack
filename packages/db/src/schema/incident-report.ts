import { index, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { community } from "./community";
import { tripMessage, tripOffer } from "./trips";

export const incidentReportTypeEnum = pgEnum("incident_report_type", [
  "harassment",
  "dangerous_driving",
  "no_show",
  "inappropriate_behavior",
  "other",
]);

export const incidentReportStatusEnum = pgEnum("incident_report_status", ["open", "reviewed"]);

export const incidentReport = pgTable(
  "incident_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => community.id, { onDelete: "cascade" }),
    offerId: uuid("offer_id")
      .notNull()
      .references(() => tripOffer.id, { onDelete: "restrict" }),
    reporterId: text("reporter_id").references(() => user.id, { onDelete: "set null" }),
    reportedUserId: text("reported_user_id").references(() => user.id, { onDelete: "set null" }),
    messageId: uuid("message_id").references(() => tripMessage.id, { onDelete: "set null" }),
    type: incidentReportTypeEnum("type").notNull(),
    description: varchar("description", { length: 1000 }),
    status: incidentReportStatusEnum("status").default("open").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("incident_report_community_created_idx").on(table.communityId, table.createdAt),
  ],
);

export type IncidentReport = typeof incidentReport.$inferSelect;
export type NewIncidentReport = typeof incidentReport.$inferInsert;

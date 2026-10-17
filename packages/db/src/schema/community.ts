import {
  boolean,
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps } from "./columns";

export const communityKindEnum = pgEnum("community_kind", [
  "company",
  "university",
  "public_entity",
  "event",
]);

export const memberRoleEnum = pgEnum("member_role", ["member", "admin"]);

export const verificationMethodEnum = pgEnum("verification_method", ["join_code", "email_domain"]);

export const usualModeEnum = pgEnum("usual_mode", [
  "drove_alone",
  "drove_with_others",
  "car_passenger",
  "public_transport",
  "taxi_app",
  "other",
]);

export const travelRoleEnum = pgEnum("travel_role", ["driver", "passenger", "both"]);

export const community = pgTable("community", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  kind: communityKindEnum("kind").notNull(),
  destinationName: text("destination_name").notNull(),
  destinationLat: doublePrecision("destination_lat").notNull(),
  destinationLng: doublePrecision("destination_lng").notNull(),
  allowedEmailDomains: text("allowed_email_domains").array().default([]).notNull(),
  joinCodeHash: text("join_code_hash"),
  // Synthetic data, labelled as such on every screen that shows the community.
  isDemo: boolean("is_demo").default(false).notNull(),
  ...timestamps,
});

export const communityMember = pgTable(
  "community_member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => community.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").default("member").notNull(),
    verificationMethod: verificationMethodEnum("verification_method").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
    alias: text("alias"),
    usualMode: usualModeEnum("usual_mode"),
    travelRole: travelRoleEnum("travel_role"),
    identifiesAsWoman: boolean("identifies_as_woman").default(false).notNull(),
    womenOnly: boolean("women_only").default(false).notNull(),
    isTeam: boolean("is_team").default(false).notNull(),
    consentVersion: text("consent_version"),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("community_member_user_id_idx").on(table.userId)],
);

export type Community = typeof community.$inferSelect;
export type CommunityMember = typeof communityMember.$inferSelect;

import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// People who want Te Jalo before their institution joins (US-033). `institution` entries
// come from someone with a role there (the waitlist that counts for a pilot);
// `individual` ones only ask to be told when their institution is in.
export const waitlistKindEnum = pgEnum("waitlist_kind", ["institution", "individual"]);

export const waitlistEntry = pgTable(
  "waitlist_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: waitlistKindEnum("kind").notNull(),
    institution: text("institution").notNull(),
    // Only institutional entries carry a role, a head count and the pilot answer.
    role: text("role"),
    onSiteCount: integer("on_site_count"),
    wantsPilot: boolean("wants_pilot"),
    // Stored lower-case, so the same address in other capitals is the same entry.
    email: text("email").notNull(),
    consent: boolean("consent").notNull(),
    // Set by the database: a client never chooses when it signed up.
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("waitlist_entry_kind_email_idx").on(table.kind, table.email)],
);

export type WaitlistEntry = typeof waitlistEntry.$inferSelect;

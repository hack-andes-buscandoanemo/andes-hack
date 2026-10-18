import { places } from "@andes-hack/matching";
import { eq, getTableColumns, sql } from "drizzle-orm";
import type {
  PgColumn,
  PgDatabase,
  PgQueryResultHKT,
  PgTable,
  PgUpdateSetSource,
} from "drizzle-orm/pg-core";

import { hashJoinCode } from "../join-code";
import { community, communityMember, meetingPoint, user, zone } from "../schema";

export interface SeedConfig {
  joinCode: string;
  adminEmail: string;
}

export interface TableCount {
  created: number;
  updated: number;
}

export interface SeedReport {
  tables: Record<string, TableCount>;
  // The team admin is a real account: someone must sign up with that email first.
  admin: "promoted" | "missing_account";
}

type Database = PgDatabase<PgQueryResultHKT>;

// Postgres leaves xmax at 0 on the rows an INSERT … ON CONFLICT DO UPDATE created, not updated.
const wasCreated = sql<boolean>`xmax = 0`;

function tableCount(rows: { created: boolean }[]): TableCount {
  const created = rows.filter((row) => row.created).length;
  return { created, updated: rows.length - created };
}

// On conflict, every column the seed writes takes the incoming value again; the rest stay as they are.
function refreshed<T extends PgTable>(table: T, rows: object[], conflictKeys: PgColumn[]) {
  const columns: Record<string, PgColumn> = getTableColumns(table);
  const writtenKeys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return Object.fromEntries(
    writtenKeys
      .filter((key) => !conflictKeys.includes(columns[key]!))
      .map((key) => [key, sql`excluded.${sql.identifier(columns[key]!.name)}`]),
  ) as PgUpdateSetSource<T>;
}

async function upsert<T extends PgTable>(
  db: Database,
  table: T,
  conflictKeys: PgColumn[],
  rows: T["$inferInsert"][],
) {
  const upserted = await db
    .insert(table)
    .values(rows)
    .onConflictDoUpdate({ target: conflictKeys, set: refreshed(table, rows, conflictKeys) })
    .returning({ created: wasCreated });
  return tableCount(upserted);
}

export async function seedDemoCommunity(db: Database, config: SeedConfig): Promise<SeedReport> {
  const destination = places.destinations.find((place) => place.id === "centro-empresarial-real");
  if (!destination) throw new Error("places.json no tiene el destino centro-empresarial-real");

  const zones = await upsert(
    db,
    zone,
    [zone.id],
    places.zones.map(({ id, name, district, lat, lng }) => ({ id, name, district, lat, lng })),
  );
  const meetingPoints = await upsert(
    db,
    meetingPoint,
    [meetingPoint.id],
    places.meetingPoints.map(({ id, zoneId, name, kind, lat, lng, osm, retrievedAt }) => ({
      id,
      zoneId,
      name,
      kind,
      lat,
      lng,
      source: `OpenStreetMap ${osm} (${retrievedAt})`,
    })),
  );

  const comunidadAlfa = {
    slug: "comunidad-alfa",
    name: "Comunidad Alfa",
    kind: "company" as const,
    destinationName: destination.name,
    destinationLat: destination.lat,
    destinationLng: destination.lng,
    joinCodeHash: await hashJoinCode(config.joinCode),
    // The community of the demo, not demo data: real people join it with the code, so
    // `is_demo`, which labels synthetic data, stays false.
    isDemo: false,
  };
  const communities = await db
    .insert(community)
    .values(comunidadAlfa)
    .onConflictDoUpdate({
      target: community.slug,
      set: refreshed(community, [comunidadAlfa], [community.slug]),
    })
    .returning({ id: community.id, created: wasCreated });
  const [alfa] = communities;
  if (!alfa) throw new Error("No se pudo guardar Comunidad Alfa");

  const tables = { zone: zones, meeting_point: meetingPoints, community: tableCount(communities) };

  // better-auth stores every email it signs up in lower case.
  const [account] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, config.adminEmail.toLowerCase()));
  if (!account) return { tables, admin: "missing_account" };

  // The team holds the join code, hence join_code. If they already joined, they keep the rest
  // of their membership.
  await db
    .insert(communityMember)
    .values({
      communityId: alfa.id,
      userId: account.id,
      verificationMethod: "join_code",
      role: "admin",
      isTeam: true,
    })
    .onConflictDoUpdate({
      target: [communityMember.communityId, communityMember.userId],
      set: { role: "admin", isTeam: true },
    });

  return { tables, admin: "promoted" };
}

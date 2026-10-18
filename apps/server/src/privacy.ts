import type { db as defaultDb } from "@andes-hack/db";
import { sql } from "drizzle-orm";

type Database = typeof defaultDb;

export async function deletePersonalData(database: Database, userId: string, deletedAt: Date) {
  await database.execute(sql`SELECT public.delete_personal_data(${userId})`);
  return { message: "Tus datos fueron eliminados.", deletedAt: deletedAt.toISOString() };
}

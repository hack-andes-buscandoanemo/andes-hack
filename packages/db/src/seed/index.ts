import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";

import { seedDemoCommunity } from "./demo-community";
import { readSeedEnv } from "./env";

// bun run --filter @andes-hack/db db:seed runs from packages/db. It reads the same file as
// drizzle.config.ts and then the repository's root .env; variables already set win.
dotenv.config({ path: ["../../apps/server/.env", "../../.env"], quiet: true });

let env: ReturnType<typeof readSeedEnv>;
try {
  env = readSeedEnv(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const report = await seedDemoCommunity(drizzle(neon(env.DATABASE_URL)), {
  joinCode: env.DEMO_JOIN_CODE,
  adminEmail: env.DEMO_ADMIN_EMAIL,
});

console.log("Comunidad Alfa y lugares reales de Lima cargados:");
for (const [table, { created, updated }] of Object.entries(report.tables)) {
  console.log(`  ${table.padEnd(14)} creados: ${created} · actualizados: ${updated}`);
}
console.log(
  report.admin === "promoted"
    ? `  Administrador: ${env.DEMO_ADMIN_EMAIL} administra Comunidad Alfa.`
    : `  Administrador: no hay una cuenta con ${env.DEMO_ADMIN_EMAIL}. Regístrala en la app y vuelve a ejecutar el seed.`,
);

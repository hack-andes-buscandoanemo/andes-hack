import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";

import { removeMockData, seedMockData } from "./mock-data";

// bun run --filter @andes-hack/db db:seed:mock fills the app with fictional people, trips and
// seat requests; with --remove it takes them out again. Needs Comunidad Alfa (`db:seed`) first.
dotenv.config({ path: ["../../apps/server/.env", "../../.env"], quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta la variable de entorno DATABASE_URL.");
  process.exit(1);
}
const db = drizzle(neon(url));

if (process.argv.includes("--remove")) {
  const { users } = await removeMockData(db);
  console.log(`Datos de prueba eliminados: ${users} cuentas ficticias y todo lo suyo.`);
} else {
  const report = await seedMockData(db);
  console.log("Datos de prueba cargados (cuentas @mock.tejalo.test, sin contraseña):");
  console.log(`  personas:      ${report.users}`);
  console.log(`  propuestas:    ${report.offers} viajes de conductores`);
  console.log(`  solicitudes:   ${report.requests} búsquedas de pasajeros`);
  console.log(`  asientos:      ${report.seatRequests} solicitudes de asiento`);
  console.log(`  mensajes:      ${report.messages} en el chat de viajes`);
  console.log("Para quitarlos: bun run db:seed:mock -- --remove");
}

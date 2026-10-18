import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";

import { removeMockData, removeMockPassenger, seedMockData, seedMockPassenger } from "./mock-data";

// bun run --filter @andes-hack/db db:seed:mock fills the app with fictional people, trips and
// seat requests; with --remove it takes them out again. Needs Comunidad Alfa (`db:seed`) first.
dotenv.config({ path: ["../../apps/server/.env", "../../.env"], quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta la variable de entorno DATABASE_URL.");
  process.exit(1);
}
const db = drizzle(neon(url));

// --user <correo>: the same data, plus the life of a passenger for that real account.
const userFlag = process.argv.indexOf("--user");
const email = userFlag >= 0 ? process.argv[userFlag + 1] : undefined;
if (userFlag >= 0 && !email) {
  console.error("Falta el correo: --user <correo>.");
  process.exit(1);
}

if (process.argv.includes("--remove")) {
  if (email) {
    const { removed } = await removeMockPassenger(db, email);
    console.log(
      removed
        ? `Datos de prueba de ${email} eliminados (búsquedas, asientos, viajes hechos y mensajes).`
        : `No hay una cuenta con ${email}.`,
    );
  }
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
  if (email) {
    const mine = await seedMockPassenger(db, email);
    console.log(`Como pasajero, ${email}:`);
    console.log(`  búsquedas:     ${mine.needs} (ida y vuelta)`);
    console.log(`  asientos:      ${mine.seatRequests} (uno aceptado y uno pendiente)`);
    console.log(`  viajes hechos: ${mine.pastTrips} en los últimos días`);
    console.log(`  mensajes:      ${mine.messages}`);
    if (mine.travelRole === "driver") {
      console.log("  Ojo: tu perfil dice que solo manejas; cámbialo a pasajero en Perfil.");
    }
  }
  console.log(`Para quitarlos: bun run db:seed:mock -- --remove${email ? ` --user ${email}` : ""}`);
}

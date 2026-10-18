// Precomputes free-flow driving minutes and kilometres between every pair of places in
// src/places.json with the public OSRM server, and writes src/travel-matrix.json.
//
// Run it once, by hand, when places.json changes: `bun run matrix:build`, then `bun check`
// to format the JSON.
// The demo never calls OSRM: router.project-osrm.org does not allow heavy use, so the
// table is asked for in small blocks, one request per second.

import { haversineKm } from "../src/geo";
import places from "../src/places.json";

const osrm = "https://router.project-osrm.org/table/v1/driving";
const blockSize = 25;
const userAgent = "andes-hack-te-jalo/0.1 (https://github.com/hack-andes-buscandoanemo/andes-hack)";

interface OsrmTable {
  code: string;
  message?: string;
  durations: (number | null)[][];
  distances: (number | null)[][];
}

const all = [...places.zones, ...places.meetingPoints, ...places.destinations];
const ids = all.map((place) => place.id);
const minutes = all.map(() => all.map((): number | null => null));
const km = all.map(() => all.map((): number | null => null));

const blocks: number[][] = [];
for (let start = 0; start < all.length; start += blockSize) {
  blocks.push(all.slice(start, start + blockSize).map((_, offset) => start + offset));
}

for (const from of blocks) {
  for (const to of blocks) {
    const coordinates = [...from, ...to]
      .map((index) => `${all[index]!.lng},${all[index]!.lat}`)
      .join(";");
    const sourceIndexes = from.map((_, position) => position).join(";");
    const destinationIndexes = to.map((_, position) => from.length + position).join(";");
    const url = `${osrm}/${coordinates}?sources=${sourceIndexes}&destinations=${destinationIndexes}&annotations=duration,distance`;

    const response = await fetch(url, { headers: { "User-Agent": userAgent } });
    const table = (await response.json()) as OsrmTable;
    if (table.code !== "Ok") throw new Error(`OSRM respondió ${table.code}: ${table.message}`);

    from.forEach((row, i) =>
      to.forEach((column, j) => {
        const seconds = table.durations[i]?.[j] ?? null;
        const metres = table.distances[i]?.[j] ?? null;
        minutes[row]![column] = seconds === null ? null : Math.round(seconds / 6) / 10;
        km[row]![column] = metres === null ? null : Math.round(metres / 10) / 100;
      }),
    );
    await Bun.sleep(1100);
  }
}

// Today in Lima (UTC−5), the date the table was asked for.
const retrievedAt = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

await Bun.write(
  new URL("../src/travel-matrix.json", import.meta.url),
  `${JSON.stringify({
    source: "OSRM (router.project-osrm.org), perfil driving: tiempos a flujo libre, sin tráfico",
    license: "© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)",
    retrievedAt,
    ids,
    minutes,
    km,
  })}\n`,
);

// The fallback for pairs without a route uses two assumptions; these medians are where
// their values in src/sources.ts come from. Pairs closer than 1 km are left out because
// snapping to the road dominates them.
const circuity: number[] = [];
const speed: number[] = [];
all.forEach((a, row) =>
  all.forEach((b, column) => {
    const straight = haversineKm(a, b);
    const road = km[row]![column];
    const time = minutes[row]![column];
    if (straight < 1 || road == null || !time) return;
    circuity.push(road / straight);
    speed.push(road / (time / 60));
  }),
);

const median = (values: number[]) => values.toSorted((x, y) => x - y)[values.length >> 1];
const missing = minutes.flat().filter((value) => value === null).length;

console.log(`${ids.length} lugares, ${missing} pares sin ruta, consulta del ${retrievedAt}`);
console.log(`Mediana del factor de rodeo (km por calle / km en línea recta): ${median(circuity)}`);
console.log(`Mediana de la velocidad a flujo libre: ${median(speed)} km/h`);

// Precomputes the street shape of every zone → sede and sede → zone drive in
// src/places.json with the public OSRM server, and writes src/route-shapes.json for the
// trip map (US-037).
//
// Run it once, by hand, when places.json changes: `bun run shapes:build`, then `bun check`
// to format the JSON.
// The demo never calls OSRM: router.project-osrm.org does not allow heavy use, so the
// routes are asked for one per second.

import places from "../src/places.json";

const osrm = "https://router.project-osrm.org/route/v1/driving";
const userAgent = "andes-hack-te-jalo/0.1 (https://github.com/hack-andes-buscandoanemo/andes-hack)";

interface OsrmRoute {
  code: string;
  message?: string;
  routes: { geometry: { coordinates: [number, number][] } }[];
}

// Five decimals are about a metre, more than a phone screen shows.
const rounded = (value: number) => Math.round(value * 1e5) / 1e5;

const pairs = places.destinations.flatMap((destination) =>
  places.zones.flatMap((zone) => [
    [zone, destination],
    [destination, zone],
  ]),
);

const shapes: { fromId: string; toId: string; path: [number, number][] | null }[] = [];
for (const [from, to] of pairs) {
  // `simplified` keeps the shape at the zoom of the whole route, a few dozen points.
  const url = `${osrm}/${from!.lng},${from!.lat};${to!.lng},${to!.lat}?overview=simplified&geometries=geojson`;
  const response = await fetch(url, { headers: { "User-Agent": userAgent } });
  const result = (await response.json()) as OsrmRoute;
  if (result.code !== "Ok" && result.code !== "NoRoute") {
    throw new Error(`OSRM respondió ${result.code}: ${result.message}`);
  }
  const coordinates = result.routes[0]?.geometry.coordinates;
  shapes.push({
    fromId: from!.id,
    toId: to!.id,
    // GeoJSON is [lng, lat]; the map reads [lat, lng].
    path: coordinates ? coordinates.map(([lng, lat]) => [rounded(lat), rounded(lng)]) : null,
  });
  await Bun.sleep(1100);
}

// Today in Lima (UTC−5), the date the routes were asked for.
const retrievedAt = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

await Bun.write(
  new URL("../src/route-shapes.json", import.meta.url),
  `${JSON.stringify({
    source: "OSRM (router.project-osrm.org), servicio route, perfil driving",
    license: "© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)",
    retrievedAt,
    shapes,
  })}\n`,
);

const missing = shapes.filter((shape) => shape.path === null).length;
const points = shapes.reduce((total, shape) => total + (shape.path?.length ?? 0), 0);
console.log(`${shapes.length} trazados, ${missing} sin ruta, ${points} puntos, del ${retrievedAt}`);

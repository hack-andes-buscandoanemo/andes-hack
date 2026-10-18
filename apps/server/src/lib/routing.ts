import { haversineKm } from "@andes-hack/matching";

export type Point = { lat: number; lng: number };

export interface StreetRoute {
  // [lat, lng] points in driving order.
  path: [number, number][];
  minutes: number;
  km: number;
  // True when OSRM could not draw the streets and the path is a straight line.
  approximate: boolean;
}

export type RouteFinder = (from: Point, to: Point) => Promise<StreetRoute>;

// The points kept of a route: enough to measure walking distance to it, few enough to store.
const MAX_POINTS = 400;
const OSRM = "https://router.project-osrm.org/route/v1/driving";
const TIMEOUT_MS = 6_000;
// Average speed of a car in Lima, for the straight-line fallback.
const FALLBACK_KMH = 25;

function thin(path: [number, number][]) {
  if (path.length <= MAX_POINTS) return path;
  const step = (path.length - 1) / (MAX_POINTS - 1);
  return Array.from({ length: MAX_POINTS }, (_, i) => path[Math.round(i * step)]!);
}

// A straight line with a point every ~100 m, so matching can still measure distances to it.
export function straightRoute(from: Point, to: Point): StreetRoute {
  const km = haversineKm(from, to);
  const steps = Math.min(MAX_POINTS - 1, Math.max(2, Math.ceil(km * 10)));
  const path = Array.from({ length: steps + 1 }, (_, i): [number, number] => [
    from.lat + ((to.lat - from.lat) * i) / steps,
    from.lng + ((to.lng - from.lng) * i) / steps,
  ]);
  return {
    path,
    minutes: Math.max(1, Math.round((km / FALLBACK_KMH) * 60)),
    km,
    approximate: true,
  };
}

// The streets between two points from OpenStreetMap data, through the OSRM demo server; the
// same one the route shapes of the zones came from. A failure draws a straight line instead,
// so publishing a trip never depends on the service being up.
// https://project-osrm.org/
export const osrmRoute: RouteFinder = async (from, to) => {
  try {
    const url =
      `${OSRM}/${from.lng},${from.lat};${to.lng},${to.lat}` +
      "?overview=full&geometries=geojson&alternatives=false&steps=false";
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return straightRoute(from, to);
    const body = (await response.json()) as {
      routes?: {
        duration: number;
        distance: number;
        geometry: { coordinates: [number, number][] };
      }[];
    };
    const [best] = body.routes ?? [];
    if (!best || best.geometry.coordinates.length < 2) return straightRoute(from, to);
    // GeoJSON is [lng, lat]; the app keeps [lat, lng].
    const path = thin(best.geometry.coordinates.map(([lng, lat]): [number, number] => [lat, lng]));
    return {
      path,
      minutes: Math.max(1, Math.round(best.duration / 60)),
      km: Math.round(best.distance / 100) / 10,
      approximate: false,
    };
  } catch {
    return straightRoute(from, to);
  }
};

export type Coordinates = { lat: number; lng: number };

const earthRadiusM = 6_371_000;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

// Great-circle distance between two coordinates, in metres.
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(h));
}

// The point of the route closest to `target`, and how far from it: where to get off the car
// to end up nearest to where the person is really going.
export function nearestOnPath(path: readonly (readonly [number, number])[], target: Coordinates) {
  let best: { point: Coordinates; meters: number } | null = null;
  for (const [lat, lng] of path) {
    const meters = distanceMeters({ lat, lng }, target);
    if (!best || meters < best.meters) best = { point: { lat, lng }, meters };
  }
  return best;
}

// OpenStreetMap's Nominatim: free geocoding for a person typing one address now and then.
// https://operations.osmfoundation.org/policies/nominatim/
const nominatim = "https://nominatim.openstreetmap.org";
// Lima and Callao, so "Av. Javier Prado" does not resolve to another city.
const limaViewbox = "-77.20,-11.80,-76.80,-12.30";

export async function findPlace(query: string): Promise<(Coordinates & { name: string }) | null> {
  const url =
    `${nominatim}/search?format=jsonv2&limit=1&countrycodes=pe&bounded=1` +
    `&viewbox=${limaViewbox}&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { "Accept-Language": "es" } });
  if (!response.ok) throw new Error("No pudimos buscar ese lugar.");
  const [hit] = (await response.json()) as { lat: string; lon: string; display_name: string }[];
  return hit
    ? { lat: Number(hit.lat), lng: Number(hit.lon), name: hit.display_name.split(",")[0]! }
    : null;
}

// The street a point is on, or null when OpenStreetMap does not know one.
export async function streetAt(point: Coordinates): Promise<string | null> {
  const url = `${nominatim}/reverse?format=jsonv2&zoom=17&lat=${point.lat}&lon=${point.lng}`;
  try {
    const response = await fetch(url, { headers: { "Accept-Language": "es" } });
    if (!response.ok) return null;
    const body = (await response.json()) as { address?: { road?: string } };
    return body.address?.road ?? null;
  } catch {
    return null;
  }
}

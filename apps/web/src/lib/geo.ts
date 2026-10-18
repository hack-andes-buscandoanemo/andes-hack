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

// A place the person can pick: what OpenStreetMap calls it and where it is.
export type Place = Coordinates & { label: string };

export async function findPlaces(query: string, limit = 5): Promise<Place[]> {
  const url =
    `${nominatim}/search?format=jsonv2&limit=${limit}&countrycodes=pe&bounded=1` +
    `&viewbox=${limaViewbox}&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { "Accept-Language": "es" } });
  if (!response.ok) throw new Error("No pudimos buscar ese lugar.");
  const hits = (await response.json()) as { lat: string; lon: string; display_name: string }[];
  return hits.map((hit) => ({
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    // The first parts of the name are the place and its street; the rest is the whole region.
    label: hit.display_name.split(",").slice(0, 3).join(",").trim(),
  }));
}

export async function findPlace(query: string): Promise<(Coordinates & { name: string }) | null> {
  const [hit] = await findPlaces(query, 1);
  return hit ? { lat: hit.lat, lng: hit.lng, name: hit.label.split(",")[0]! } : null;
}

// Where the device is now, named by its street; null when the person does not allow it.
export async function currentPlace(): Promise<Place | null> {
  if (!("geolocation" in navigator)) return null;
  const position = await new Promise<GeolocationPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
      enableHighAccuracy: true,
      timeout: 10_000,
    });
  });
  if (!position) return null;
  const point = { lat: position.coords.latitude, lng: position.coords.longitude };
  const street = await streetAt(point);
  return { ...point, label: street ? `Mi ubicación, ${street}` : "Mi ubicación" };
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

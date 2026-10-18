import { haversineKm } from "./geo";

// Matching between two addresses chosen on the map (no zones, no fixed headquarters): a trip
// fits a person when its street route passes within walking distance of where they are and of
// where they are going, in that order, at a time that suits them.

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface FreeOffer {
  id: string;
  // The street route of the trip, as [lat, lng] points in driving order.
  path: readonly (readonly [number, number])[];
  // How long the whole route takes by car.
  minutes: number;
  // Time of day the trip leaves, "HH:MM" (seconds are ignored).
  departureTime: string;
  date: string | null;
  daysOfWeek: readonly number[] | null;
  seatsFree: number;
  womenOnly: boolean;
}

export interface FreeRequest {
  origin: GeoPoint;
  destination: GeoPoint;
  windowStart: string;
  windowEnd: string;
  date: string | null;
  daysOfWeek: readonly number[] | null;
  maxWalkMinutes: number;
  womenOnly: boolean;
  passengerIsWoman: boolean;
}

export type FreeReason =
  | "days_mismatch"
  | "women_only"
  | "no_seats"
  | "too_far_from_route"
  | "wrong_direction"
  | "outside_time_window";

export interface FreeStop {
  lat: number;
  lng: number;
  // Position in the offer's path, to order stops along the route.
  pathIndex: number;
  walkMeters: number;
}

export interface FreeMatch {
  offerId: string;
  pickup: FreeStop;
  dropoff: FreeStop;
  // Times of day, "HH:MM".
  pickupAt: string;
  arrivalAt: string;
  // Minutes on foot from where the person is to the pickup.
  walkMinutes: number;
  rideMinutes: number;
  rideKm: number;
}

// A person walks about 80 metres a minute.
export const WALK_METERS_PER_MINUTE = 80;
// A ride shorter than this is not worth a seat.
const MIN_RIDE_METERS = 300;

// How far each reason gets an offer through the checks, so the one reported when nothing
// matches is the closest miss and not the first rule that failed.
const progress: Record<FreeReason, number> = {
  days_mismatch: 0,
  women_only: 1,
  no_seats: 2,
  too_far_from_route: 3,
  wrong_direction: 4,
  outside_time_window: 5,
};

const minutesOfDay = (clock: string) => {
  const [hours = "0", minutes = "0"] = clock.split(":");
  return Number(hours) * 60 + Number(minutes);
};

const clockOf = (minutes: number) => {
  const day = 24 * 60;
  const wrapped = ((Math.round(minutes) % day) + day) % day;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
};

// ISO weekday (1 = Monday … 7 = Sunday) of a YYYY-MM-DD date.
const isoWeekday = (date: string) => {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
};

function sameSchedule(
  a: { date: string | null; daysOfWeek: readonly number[] | null },
  b: { date: string | null; daysOfWeek: readonly number[] | null },
) {
  if (a.date && b.date) return a.date === b.date;
  if (a.daysOfWeek && b.daysOfWeek) return a.daysOfWeek.some((day) => b.daysOfWeek!.includes(day));
  const date = a.date ?? b.date;
  const days = a.daysOfWeek ?? b.daysOfWeek;
  return Boolean(date && days && days.includes(isoWeekday(date)));
}

function nearestVertex(path: FreeOffer["path"], target: GeoPoint, from = 0) {
  let best = { index: -1, meters: Number.POSITIVE_INFINITY };
  for (let index = from; index < path.length; index += 1) {
    const [lat, lng] = path[index]!;
    const meters = haversineKm({ lat, lng }, target) * 1000;
    if (meters < best.meters) best = { index, meters };
  }
  return best;
}

type Outcome = { match: FreeMatch } | { reason: FreeReason };

export function matchFreeOffer(request: FreeRequest, offer: FreeOffer): Outcome {
  if (!sameSchedule(request, offer)) return { reason: "days_mismatch" };
  if (offer.womenOnly && !request.passengerIsWoman) return { reason: "women_only" };
  if (request.womenOnly && !offer.womenOnly) return { reason: "women_only" };
  if (offer.seatsFree <= 0) return { reason: "no_seats" };
  if (offer.path.length < 2) return { reason: "too_far_from_route" };

  const maxWalkMeters = request.maxWalkMinutes * WALK_METERS_PER_MINUTE;
  const pickup = nearestVertex(offer.path, request.origin);
  const dropoff = nearestVertex(offer.path, request.destination);
  if (pickup.meters > maxWalkMeters || dropoff.meters > maxWalkMeters) {
    return { reason: "too_far_from_route" };
  }

  // Metres driven from the start up to each vertex.
  const along: number[] = [0];
  for (let index = 1; index < offer.path.length; index += 1) {
    const [aLat, aLng] = offer.path[index - 1]!;
    const [bLat, bLng] = offer.path[index]!;
    along.push(
      along[index - 1]! + haversineKm({ lat: aLat, lng: aLng }, { lat: bLat, lng: bLng }) * 1000,
    );
  }
  const total = along[along.length - 1]!;
  const rideMeters = along[dropoff.index]! - along[pickup.index]!;
  if (total === 0 || rideMeters < MIN_RIDE_METERS) return { reason: "wrong_direction" };

  const leaves = minutesOfDay(offer.departureTime);
  const pickupMinutes = leaves + (offer.minutes * along[pickup.index]!) / total;
  const arrivalMinutes = leaves + (offer.minutes * along[dropoff.index]!) / total;
  if (
    pickupMinutes < minutesOfDay(request.windowStart) ||
    pickupMinutes > minutesOfDay(request.windowEnd)
  ) {
    return { reason: "outside_time_window" };
  }

  const stop = (found: typeof pickup): FreeStop => {
    const [lat, lng] = offer.path[found.index]!;
    return { lat, lng, pathIndex: found.index, walkMeters: Math.round(found.meters) };
  };
  return {
    match: {
      offerId: offer.id,
      pickup: stop(pickup),
      dropoff: stop(dropoff),
      pickupAt: clockOf(pickupMinutes),
      arrivalAt: clockOf(arrivalMinutes),
      walkMinutes: Math.max(1, Math.ceil(pickup.meters / WALK_METERS_PER_MINUTE)),
      rideMinutes: Math.max(1, Math.round(arrivalMinutes - pickupMinutes)),
      rideKm: Math.round(rideMeters / 100) / 10,
    },
  };
}

// The offers that fit, the one that asks the least walking first; when none does, the reason
// of the closest miss.
export function rankFreeOffers(
  request: FreeRequest,
  offers: readonly FreeOffer[],
): { matches: FreeMatch[]; reason: FreeReason | null } {
  const matches: FreeMatch[] = [];
  let closest: FreeReason | null = null;
  for (const offer of offers) {
    const outcome = matchFreeOffer(request, offer);
    if ("match" in outcome) matches.push(outcome.match);
    else if (closest === null || progress[outcome.reason] > progress[closest]) {
      closest = outcome.reason;
    }
  }
  matches.sort(
    (a, b) =>
      a.pickup.walkMeters + a.dropoff.walkMeters - (b.pickup.walkMeters + b.dropoff.walkMeters) ||
      a.pickupAt.localeCompare(b.pickupAt),
  );
  return { matches, reason: matches.length > 0 ? null : closest };
}

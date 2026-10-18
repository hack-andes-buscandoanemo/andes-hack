import { bestInsertion, type Direction, type OfferRoute } from "./insertion";
import type { FallbackMode } from "./metrics";
import type { DayInstance, DayRequest } from "./optimizer";
import { places } from "./places";
import type { TravelTimeModel } from "./travel-time";

// Random days of one community on the real places of Lima, always the same for the same
// seed. For the optimizer's tests and scripts/exhaustive-optima.ts; index.ts does not
// export it.

// mulberry32: tiny and good enough to vary test days.
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DaySize {
  offers: number;
  requests: number;
}

const communityId = "comunidad-alfa";
const destinationId = places.destinations[0]!.id;
const zoneIds = places.zones.map((zone) => zone.id);
const weekdays = [1, 2, 3, 4, 5];
// 19 October 2026 is a Monday.
const monday = "2026-10-19";

// An arbitrary mix that leans, like Lima, towards public transport.
const fallbackModes: readonly (readonly [FallbackMode, number])[] = [
  ["public_transport", 0.5],
  ["drive_alone", 0.25],
  ["taxi_app", 0.1],
  ["picked_up", 0.1],
  ["other", 0.05],
];

const timeOfDay = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function randomDay(seed: number, size: DaySize, model: TravelTimeModel): DayInstance {
  const random = seededRandom(seed);
  const chance = (probability: number) => random() < probability;
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  // Minutes of the day between `from` and `to` hours, on the quarter hour.
  const quarter = (from: number, to: number) =>
    from * 60 + 15 * Math.floor(random() * ((to - from) * 4 + 1));
  const fallbackMode = () => {
    let left = random();
    for (const [mode, share] of fallbackModes) if ((left -= share) < 0) return mode;
    return "other";
  };

  const direction: Direction = chance(0.7) ? "outbound" : "return";
  const outbound = direction === "outbound";
  const driverZones = Array.from({ length: size.offers }, () => pick(zoneIds));

  const requests: DayRequest[] = Array.from({ length: size.requests }, (_, index) => {
    // When they want to arrive at the destination, or to leave it on the way back.
    const start = outbound ? quarter(7.25, 8.5) : quarter(17.5, 19);
    const passengerIsWoman = chance(0.5);
    return {
      id: `necesidad-${index}`,
      passengerId: `pasajero-${index}`,
      communityId,
      direction,
      // Most live where some driver does, so a fair share of the day fits.
      originZoneId: driverZones.length > 0 && chance(0.7) ? pick(driverZones) : pick(zoneIds),
      windowStart: timeOfDay(start),
      windowEnd: timeOfDay(start + pick([30, 45, 60])),
      date: null,
      daysOfWeek: weekdays,
      maxWalkMinutes: pick([5, 10, 15]),
      womenOnly: passengerIsWoman && chance(0.2),
      passengerIsWoman,
      fallbackMode: fallbackMode(),
    };
  });

  const offers: OfferRoute[] = Array.from({ length: size.offers }, (_, index) => {
    const driverIsWoman = chance(0.4);
    const offer: OfferRoute = {
      id: `oferta-${index}`,
      communityId,
      direction,
      originZoneId: driverZones[index]!,
      destinationId,
      departureTime: timeOfDay(outbound ? quarter(6.5, 7.75) : quarter(17.5, 19)),
      date: null,
      daysOfWeek: weekdays,
      seatsTotal: 1 + Math.floor(random() * 4),
      maxDetourMinutes: pick([0, 5, 10, 10]),
      womenOnly: driverIsWoman && chance(0.2),
      driverIsWoman,
      rejectedPassengerIds: requests
        .filter(() => chance(0.05))
        .map((request) => request.passengerId),
      passengers: [],
    };
    // Sometimes the driver already accepted someone from outside the day's requests.
    if (requests.length === 0 || !chance(0.3)) return offer;
    const accepted = { ...pick(requests), passengerId: `aceptado-${index}` };
    const insertion = bestInsertion(offer, accepted, model);
    if (!insertion.feasible) return offer;
    const { meetingPointId } = insertion;
    const { windowStart, windowEnd } = accepted;
    return { ...offer, passengers: [{ meetingPointId, windowStart, windowEnd }] };
  });

  return { date: monday, offers, requests };
}

import type { TravelTimeModel } from "./travel-time";

// `outbound` goes to the community's destination; `return` comes back from it.
export type Direction = "outbound" | "return";

// In the order they are checked, which also settles a tie for the most common reason.
export const infeasibleReasons = [
  "different_community",
  "days_mismatch",
  "women_only",
  "previously_rejected",
  "no_seats",
  "no_walkable_meeting_point",
  "outside_time_window",
  "detour_exceeded",
] as const;

export type InfeasibleReason = (typeof infeasibleReasons)[number];

// Times of day are "HH:MM" in Lima; dates are "YYYY-MM-DD"; weekdays are ISO (1 = Monday).

// A passenger the driver already accepted, in the order the route visits them.
export interface AcceptedPassenger {
  meetingPointId: string;
  windowStart: string;
  windowEnd: string;
}

// A driver's offer as the engine sees it.
export interface OfferRoute {
  id: string;
  communityId: string;
  direction: Direction;
  // The driver's zone: where the outbound trip starts and the return trip ends.
  originZoneId: string;
  // The community's destination, as a place of the travel time model.
  destinationId: string;
  departureTime: string;
  date: string | null;
  daysOfWeek: readonly number[] | null;
  seatsTotal: number;
  maxDetourMinutes: number;
  womenOnly: boolean;
  driverIsWoman: boolean;
  rejectedPassengerIds: readonly string[];
  passengers: readonly AcceptedPassenger[];
}

// A passenger's need. The window is about the destination end: when they want to arrive
// there on the outbound trip, and when they want to leave it on the return trip.
export interface RideRequest {
  passengerId: string;
  communityId: string;
  direction: Direction;
  originZoneId: string;
  windowStart: string;
  windowEnd: string;
  date: string | null;
  daysOfWeek: readonly number[] | null;
  maxWalkMinutes: number;
  womenOnly: boolean;
  passengerIsWoman: boolean;
}

export interface Insertion {
  feasible: true;
  meetingPointId: string;
  // Index of the new stop among the driver's passengers.
  position: number;
  pickupAt: string;
  arrivalAt: string;
  // Minutes this passenger adds to the driver's trip.
  detourMinutes: number;
  walkMinutes: number;
}

export type InsertionResult = Insertion | { feasible: false; reason: InfeasibleReason };

// The traffic model only looks at the weekday and the hour, so a recurring trip is timed
// on its first day within a reference week that starts on Monday 5 January 2026.
function timingDay(request: RideRequest) {
  if (request.date !== null) return request.date;
  const first = Math.min(...(request.daysOfWeek ?? [1]));
  return `2026-01-${String(4 + first).padStart(2, "0")}`;
}

function minutesOfDay(time: string) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function timeOfDay(minutes: number) {
  // Past midnight the clock starts again at 00:00.
  const rounded = Math.round(minutes) % (24 * 60);
  const hours = String(Math.floor(rounded / 60)).padStart(2, "0");
  return `${hours}:${String(rounded % 60).padStart(2, "0")}`;
}

function within(minutes: number, window: { windowStart: string; windowEnd: string }) {
  return minutes >= minutesOfDay(window.windowStart) && minutes <= minutesOfDay(window.windowEnd);
}

function limaInstant(day: string, minutes: number) {
  return new Date(Date.parse(`${day}T00:00:00-05:00`) + minutes * 60_000);
}

// Clock time, in minutes of the day, at each stop and then at the end of the trip. The
// outbound trip goes from the driver's zone to the destination; the return, back.
function stopTimes(
  route: OfferRoute,
  stopIds: readonly string[],
  day: string,
  model: TravelTimeModel,
) {
  const outbound = route.direction === "outbound";
  let clock = minutesOfDay(route.departureTime);
  let at = outbound ? route.originZoneId : route.destinationId;
  const end = outbound ? route.destinationId : route.originZoneId;
  return [...stopIds, end].map((stop) => {
    clock += model.minutes(at, stop, limaInstant(day, clock)).minutes;
    at = stop;
    return clock;
  });
}

export interface RouteTiming {
  // Each passenger's times, in route order.
  stops: { pickupAt: string; arrivalAt: string }[];
  // From the departure to the end of the trip.
  minutes: number;
}

// The route as it stands, timed on `day` with the same legs and traffic as an insertion.
export function timeRoute(route: OfferRoute, day: string, model: TravelTimeModel): RouteTiming {
  const outbound = route.direction === "outbound";
  const departure = minutesOfDay(route.departureTime);
  const ids = route.passengers.map((passenger) => passenger.meetingPointId);
  const times = stopTimes(route, ids, day, model);
  const end = times.at(-1)!;
  // On the way back passengers board at the destination and get off at their stop.
  const stops = times.slice(0, -1).map((stop) => ({
    pickupAt: timeOfDay(outbound ? stop : departure),
    arrivalAt: timeOfDay(outbound ? end : stop),
  }));
  return { stops, minutes: end - departure };
}

function isoWeekday(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
}

// The passenger needs the ride on every day they asked for.
function daysMatch(route: OfferRoute, request: RideRequest) {
  if (route.date !== null) return route.date === request.date;
  const driverDays = route.daysOfWeek ?? [];
  if (request.date !== null) return driverDays.includes(isoWeekday(request.date));
  return (request.daysOfWeek ?? []).every((day) => driverDays.includes(day));
}

// Reasons that need no travel time, checked before any route is timed.
function firstBrokenRule(route: OfferRoute, request: RideRequest): InfeasibleReason | null {
  if (route.communityId !== request.communityId) return "different_community";
  if (!daysMatch(route, request)) return "days_mismatch";
  // "Solo mujeres" binds both ways: the driver's offer and the passenger's preference.
  if (route.womenOnly && !request.passengerIsWoman) return "women_only";
  if (request.womenOnly && !route.driverIsWoman) return "women_only";
  if (route.rejectedPassengerIds.includes(request.passengerId)) return "previously_rejected";
  if (route.passengers.length >= route.seatsTotal) return "no_seats";
  return null;
}

interface Candidate {
  insertion: Insertion;
  // Minutes between the time at the destination and the middle of the passenger's window.
  windowGap: number;
}

// Smaller detour, then shorter walk, then closer to the middle of the window, compared on
// the rounded minutes the passenger sees.
function byFit(a: Candidate, b: Candidate) {
  return (
    a.insertion.detourMinutes - b.insertion.detourMinutes ||
    a.insertion.walkMinutes - b.insertion.walkMinutes ||
    a.windowGap - b.windowGap
  );
}

function bestCandidate(
  route: OfferRoute,
  request: RideRequest,
  model: TravelTimeModel,
): Candidate | InfeasibleReason {
  if (route.direction !== request.direction)
    throw new Error("La oferta y la necesidad van en sentidos distintos");
  const reason = firstBrokenRule(route, request);
  if (reason) return reason;

  const day = timingDay(request);
  const outbound = route.direction === "outbound";
  const departure = minutesOfDay(route.departureTime);
  const middle = (minutesOfDay(request.windowStart) + minutesOfDay(request.windowEnd)) / 2;
  const current = route.passengers.map((passenger) => passenger.meetingPointId);
  const tripEnd = (stops: readonly string[]) => stopTimes(route, stops, day, model).at(-1)!;
  const currentEnd = tripEnd(current);
  const straightEnd = tripEnd([]);

  let best: Candidate | undefined;
  // If some insertion keeps within the detour, the timetable is what fails.
  let detourKept = false;
  const candidates = model.walkableMeetingPoints(request.originZoneId, request.maxWalkMinutes);
  if (candidates.length === 0) return "no_walkable_meeting_point";
  for (const { meetingPointId, walkMinutes } of candidates) {
    for (let position = 0; position <= current.length; position++) {
      const times = stopTimes(route, current.toSpliced(position, 0, meetingPointId), day, model);
      const end = times.at(-1)!;
      const stop = times[position]!;
      // The maximum bounds the driver's whole detour, every passenger's together. A stop
      // right on the way adds 0 min give or take the rounding error of the legs' sum.
      if (end - straightEnd > route.maxDetourMinutes + 1e-9) continue;
      detourKept = true;
      // Windows are about the destination: arriving there, or leaving it on the way back.
      const atDestination = outbound ? end : departure;
      if (![request, ...route.passengers].every((passenger) => within(atDestination, passenger)))
        continue;
      const candidate: Candidate = {
        insertion: {
          feasible: true,
          meetingPointId,
          position,
          // On the way back passengers board at the destination and get off at their stop.
          pickupAt: timeOfDay(outbound ? stop : departure),
          arrivalAt: timeOfDay(outbound ? end : stop),
          detourMinutes: Math.round(end - currentEnd),
          walkMinutes: Math.round(walkMinutes),
        },
        windowGap: Math.abs(atDestination - middle),
      };
      // Ties keep the first one found: nearest point, then lowest id, then earliest position.
      if (!best || byFit(candidate, best) < 0) best = candidate;
    }
  }

  return best ?? (detourKept ? "outside_time_window" : "detour_exceeded");
}

export function bestInsertion(
  route: OfferRoute,
  request: RideRequest,
  model: TravelTimeModel,
): InsertionResult {
  const best = bestCandidate(route, request, model);
  return typeof best === "string" ? { feasible: false, reason: best } : best.insertion;
}

export type OfferMatch = Insertion & { offerId: string };

export interface OfferRanking {
  matches: OfferMatch[];
  // Why nothing matched; null when something did.
  reason: InfeasibleReason | null;
}

export function rankOffersForRequest(
  request: RideRequest,
  offers: readonly OfferRoute[],
  model: TravelTimeModel,
): OfferRanking {
  const found: (Candidate & { offerId: string })[] = [];
  const turnedDown = new Map<InfeasibleReason, number>();
  for (const offer of offers) {
    if (offer.direction !== request.direction) continue;
    const best = bestCandidate(offer, request, model);
    if (typeof best === "string") turnedDown.set(best, (turnedDown.get(best) ?? 0) + 1);
    else found.push({ ...best, offerId: offer.id });
  }
  found.sort((a, b) => byFit(a, b) || a.offerId.localeCompare(b.offerId));
  const matches = found.map(({ insertion, offerId }) => ({ ...insertion, offerId }));
  if (matches.length > 0) return { matches, reason: null };

  let reason: InfeasibleReason | null = null;
  for (const candidate of infeasibleReasons) {
    if ((turnedDown.get(candidate) ?? 0) > (reason ? turnedDown.get(reason)! : 0))
      reason = candidate;
  }
  // With no offers at all, no driver leaves at that time.
  return { matches, reason: reason ?? "outside_time_window" };
}

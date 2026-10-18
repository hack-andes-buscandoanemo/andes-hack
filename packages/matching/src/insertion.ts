import type { TravelTimeModel } from "./travel-time";

// `outbound` goes to the community's destination; `return` comes back from it.
export type Direction = "outbound" | "return";

export type InfeasibleReason =
  | "different_community"
  | "days_mismatch"
  | "women_only"
  | "previously_rejected"
  | "no_seats"
  | "no_walkable_meeting_point"
  | "outside_time_window"
  | "detour_exceeded";

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

const referenceMonday = "2026-01-05";

function minutesOfDay(time: string) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function timeOfDay(minutes: number) {
  const rounded = Math.round(minutes);
  const hours = String(Math.floor(rounded / 60)).padStart(2, "0");
  return `${hours}:${String(rounded % 60).padStart(2, "0")}`;
}

function within(minutes: number, window: { windowStart: string; windowEnd: string }) {
  return minutes >= minutesOfDay(window.windowStart) && minutes <= minutesOfDay(window.windowEnd);
}

function limaInstant(day: string, minutes: number) {
  return new Date(Date.parse(`${day}T00:00:00-05:00`) + minutes * 60_000);
}

// Clock time, in minutes of the day, at each stop and then at the destination.
function stopTimes(
  route: OfferRoute,
  stopIds: readonly string[],
  day: string,
  model: TravelTimeModel,
) {
  let clock = minutesOfDay(route.departureTime);
  let at = route.originZoneId;
  return [...stopIds, route.destinationId].map((stop) => {
    clock += model.minutes(at, stop, limaInstant(day, clock)).minutes;
    at = stop;
    return clock;
  });
}

export function bestInsertion(
  route: OfferRoute,
  request: RideRequest,
  model: TravelTimeModel,
): InsertionResult {
  const day = referenceMonday;
  const current = route.passengers.map((passenger) => passenger.meetingPointId);
  const currentArrival = stopTimes(route, current, day, model).at(-1)!;
  const straightArrival = stopTimes(route, [], day, model).at(-1)!;

  let best: { addedMinutes: number; insertion: Insertion } | undefined;
  let windowMet = false;
  const candidates = model.walkableMeetingPoints(request.originZoneId, request.maxWalkMinutes);
  if (candidates.length === 0) return { feasible: false, reason: "no_walkable_meeting_point" };
  for (const { meetingPointId, walkMinutes } of candidates) {
    for (let position = 0; position <= current.length; position++) {
      const times = stopTimes(route, current.toSpliced(position, 0, meetingPointId), day, model);
      const arrival = times.at(-1)!;
      const addedMinutes = arrival - currentArrival;
      if (![request, ...route.passengers].every((passenger) => within(arrival, passenger)))
        continue;
      windowMet = true;
      // The maximum bounds the driver's whole detour, every passenger's together.
      if (arrival - straightArrival > route.maxDetourMinutes) continue;
      if (best && addedMinutes >= best.addedMinutes) continue;
      best = {
        addedMinutes,
        insertion: {
          feasible: true,
          meetingPointId,
          position,
          pickupAt: timeOfDay(times[position]!),
          arrivalAt: timeOfDay(arrival),
          detourMinutes: Math.round(addedMinutes),
          walkMinutes: Math.round(walkMinutes),
        },
      };
    }
  }

  if (!best)
    return { feasible: false, reason: windowMet ? "detour_exceeded" : "outside_time_window" };
  return best.insertion;
}

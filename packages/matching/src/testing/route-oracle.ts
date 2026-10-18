import type { AcceptedPassenger, OfferRoute, RideRequest } from "../insertion";
import type { TravelTimeModel } from "../travel-time";

// US-016's rules written again, apart from insertion.ts, so the optimizer's tests and
// scripts/exhaustive-optima.ts can check the engine without trusting it. index.ts does
// not export it.

const minutesOfDay = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

const isoWeekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() || 7;

// Why this passenger can never ride with this driver, whatever the route; null if they can.
export function pairBreak(offer: OfferRoute, request: RideRequest): string | null {
  if (request.direction !== offer.direction) return "direction";
  if (request.communityId !== offer.communityId) return "community";
  const driverDays = offer.daysOfWeek ?? [];
  const daysMatch =
    offer.date !== null
      ? offer.date === request.date
      : request.date !== null
        ? driverDays.includes(isoWeekday(request.date))
        : (request.daysOfWeek ?? []).every((day) => driverDays.includes(day));
  if (!daysMatch) return "days";
  if (offer.womenOnly && !request.passengerIsWoman) return "offer is women only";
  if (request.womenOnly && !offer.driverIsWoman) return "wants a woman driver";
  if (offer.rejectedPassengerIds.includes(request.passengerId)) return "rejected";
  return null;
}

// Minutes from the departure to the end of the trip through these meeting points, in order.
export function tripMinutes(
  offer: OfferRoute,
  meetingPointIds: readonly string[],
  date: string,
  model: TravelTimeModel,
): number {
  const outbound = offer.direction === "outbound";
  const departure = minutesOfDay(offer.departureTime);
  let clock = departure;
  let from = outbound ? offer.originZoneId : offer.destinationId;
  for (const to of [...meetingPointIds, outbound ? offer.destinationId : offer.originZoneId]) {
    const at = new Date(Date.parse(`${date}T00:00:00-05:00`) + clock * 60_000);
    clock += model.minutes(from, to, at).minutes;
    from = to;
  }
  return clock - departure;
}

// What a route with these passengers, in order, breaks; null if nothing.
export function routeBreak(
  offer: OfferRoute,
  stops: readonly AcceptedPassenger[],
  date: string,
  model: TravelTimeModel,
): string | null {
  if (stops.length > offer.seatsTotal) return "more passengers than seats";
  const minutes = tripMinutes(
    offer,
    stops.map((stop) => stop.meetingPointId),
    date,
    model,
  );
  if (minutes - tripMinutes(offer, [], date, model) > offer.maxDetourMinutes + 1e-9)
    return `detour over ${offer.maxDetourMinutes} min`;
  // The window is about the destination: arriving there, or leaving it on the way back.
  const departure = minutesOfDay(offer.departureTime);
  const atDestination = offer.direction === "outbound" ? departure + minutes : departure;
  const outside = stops.some(
    (stop) =>
      atDestination < minutesOfDay(stop.windowStart) ||
      atDestination > minutesOfDay(stop.windowEnd),
  );
  return outside ? "outside a passenger's window" : null;
}

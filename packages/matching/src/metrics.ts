import { sources } from "./sources";

// Impact of a community's shared trips, counting car trips apart from people: most
// passengers in Lima come from public transport and take no car off the road. The panel
// (US-031), the profile (US-035) and the optimizer (US-017) read every figure from here.

// The same values as the enums in packages/db/src/schema (trips.ts and community.ts).
export type BookingStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled_by_passenger"
  | "cancelled_by_driver"
  | "completed"
  | "no_show";

// "Si no encuentras viaje, ¿cómo irías?", answered on each search (US-013).
export type FallbackMode = "drive_alone" | "taxi_app" | "public_transport" | "picked_up" | "other";

// How the member went the last time (US-011).
export type UsualMode =
  | "drove_alone"
  | "drove_with_others"
  | "car_passenger"
  | "public_transport"
  | "taxi_app"
  | "other";

// A passenger's booking on an offer.
export interface SeatActivity {
  status: BookingStatus;
  fallbackMode: FallbackMode;
  passengerIsTeam: boolean;
  // The date of the trip is over.
  datePassed: boolean;
  // By street, from the passenger's zone to the destination.
  distanceKm: number;
  // What picking this passenger up adds to the driver's trip.
  detourKm: number;
}

export interface OfferActivity {
  // Null when the driver's account was deleted.
  driverUsualMode: UsualMode | null;
  driverIsTeam: boolean;
  seats: readonly SeatActivity[];
}

export interface OpenNeedActivity {
  passengerIsTeam: boolean;
  hasCompatibleOffer: boolean;
}

export interface CommunityActivity {
  offers: readonly OfferActivity[];
  openNeeds: readonly OpenNeedActivity[];
}

export interface CarTripsAvoided {
  trips: number;
  // Both are estimates: the km come from each zone, and the CO₂ rests on
  // sources.fuelEconomy and sources.gasolineCo2, which /datos explains.
  km: number;
  co2Kg: number;
}

export interface ImpactMetrics {
  peopleTransported: number;
  carTripsAvoided: { potential: CarTripsAvoided; verified: CarTripsAvoided };
  // Drivers with passengers who did not make this trip by car before.
  carTripsInduced: number;
  // Potential car trips avoided minus induced ones.
  netCarTripsAvoided: number;
  // A benefit for the person; it takes no car off the road.
  fromPublicTransport: number;
  // Share of open needs with at least one compatible offer, from 0 to 1.
  coverage: number | null;
  // Share of accepted trips whose date passed that were completed, from 0 to 1.
  fulfilment: number | null;
  // Passengers per trip that had at least one; null when none had.
  averagePassengers: number | null;
}

// Whoever would otherwise take a taxi or an app also leaves a car trip undone.
const avoidsCarTrip = (seat: SeatActivity) =>
  seat.fallbackMode === "drive_alone" || seat.fallbackMode === "taxi_app";

// For the same reason a driver who came by taxi or app adds no car. An unknown mode, from
// a deleted account, counts as induced: the figure never claims an impact it cannot back.
const madeTripByCar = (mode: UsualMode | null) =>
  mode === "drove_alone" || mode === "drove_with_others" || mode === "taxi_app";

// Bookings the driver accepted and nobody cancelled, whether or not the trip took place.
const acceptedStatuses: readonly BookingStatus[] = ["accepted", "completed", "no_show"];

// Team accounts never count, as a driver or as a passenger: the rubric does not take them
// as evidence of real use.
const acceptedSeats = (offer: OfferActivity) =>
  offer.seats.filter((seat) => acceptedStatuses.includes(seat.status) && !seat.passengerIsTeam);

// Null rather than NaN when there is nothing to divide by.
const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);

// The car trips among `trips`, and the km they save once the detour to every one of
// `pickups` is driven, even for a passenger who takes no car off the road.
function carTripsAvoided(
  trips: readonly SeatActivity[],
  pickups: readonly SeatActivity[],
): CarTripsAvoided {
  const avoided = trips.filter(avoidsCarTrip);
  const km =
    avoided.reduce((sum, seat) => sum + seat.distanceKm, 0) -
    pickups.reduce((sum, seat) => sum + seat.detourKm, 0);
  // The gasoline a car would burn over those km.
  const co2Kg = (km / sources.fuelEconomy.value) * sources.gasolineCo2.value;
  return { trips: avoided.length, km, co2Kg };
}

export function measureImpact(activity: CommunityActivity): ImpactMetrics {
  const offers = activity.offers
    .filter((offer) => !offer.driverIsTeam)
    .map((offer) => ({ ...offer, seats: acceptedSeats(offer) }));
  const seats = offers.flatMap((offer) => offer.seats);
  const potential = carTripsAvoided(seats, seats);
  const tripsTaken = offers.filter((offer) => offer.seats.length > 0);
  const induced = tripsTaken.filter((offer) => !madeTripByCar(offer.driverUsualMode)).length;
  const openNeeds = activity.openNeeds.filter((need) => !need.passengerIsTeam);
  // A trip completed today is due already, though its date has not passed.
  const due = seats.filter((seat) => seat.datePassed || seat.status === "completed");
  const completed = seats.filter((seat) => seat.status === "completed");
  // The driver went to the meeting point of a passenger who did not show up all the same.
  const pickedUpOrMissed = seats.filter(
    (seat) => seat.status === "completed" || seat.status === "no_show",
  );
  return {
    peopleTransported: seats.length,
    carTripsAvoided: {
      potential,
      verified: carTripsAvoided(completed, pickedUpOrMissed),
    },
    carTripsInduced: induced,
    netCarTripsAvoided: potential.trips - induced,
    fromPublicTransport: seats.filter((seat) => seat.fallbackMode === "public_transport").length,
    coverage: ratio(openNeeds.filter((need) => need.hasCompatibleOffer).length, openNeeds.length),
    fulfilment: ratio(due.filter((seat) => seat.status === "completed").length, due.length),
    averagePassengers: ratio(seats.length, tripsTaken.length),
  };
}

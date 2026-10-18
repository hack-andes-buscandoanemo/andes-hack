// Impact of a community's shared trips, counting car trips apart from people: most
// passengers in Lima come from public transport and take no car off the road. The panel
// (US-031), the profile (US-035) and the optimizer (US-017) read every figure from here.

// The same values as the enums of @andes-hack/db.
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
}

// Whoever would otherwise take a taxi or an app also leaves a car trip undone.
const avoidsCarTrip = (seat: SeatActivity) =>
  seat.fallbackMode === "drive_alone" || seat.fallbackMode === "taxi_app";

// For the same reason a driver who came by taxi or app adds no car. An unknown mode, from
// a deleted account, counts as induced: the figure never claims an impact it cannot back.
const madeTripByCar = (mode: UsualMode | null) =>
  mode === "drove_alone" || mode === "drove_with_others" || mode === "taxi_app";

export function measureImpact(activity: CommunityActivity): ImpactMetrics {
  const seats = activity.offers.flatMap((offer) => offer.seats);
  const avoided = seats.filter(avoidsCarTrip).length;
  const induced = activity.offers.filter(
    (offer) => offer.seats.length > 0 && !madeTripByCar(offer.driverUsualMode),
  ).length;
  return {
    peopleTransported: seats.length,
    carTripsAvoided: {
      potential: { trips: avoided, km: 0, co2Kg: 0 },
      verified: { trips: 0, km: 0, co2Kg: 0 },
    },
    carTripsInduced: induced,
    netCarTripsAvoided: avoided - induced,
    fromPublicTransport: seats.filter((seat) => seat.fallbackMode === "public_transport").length,
  };
}

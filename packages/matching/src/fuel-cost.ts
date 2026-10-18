import { sources } from "./sources";

// The fuel a shared leg burns and what that is per occupant (US-034). Te Jalo never
// charges: the figure is a reference for the people in the car to talk about a voluntary
// contribution. Peru's RNAT (D.S. 017-2009-MTC, art. 3, num. 3.61) defines private
// transport as carrying people without any payment in return, with no exception for
// sharing expenses, so the app shows a cost, never a fare.

export interface FuelCostInput {
  distanceKm: number;
  // Everyone in the car, the driver included.
  occupants: number;
  pricePerGallon?: number;
  kmPerGallon?: number;
}

export interface FuelCostEstimate {
  // Rounded to the nearest céntimo.
  tripSoles: number;
  // Rounded down to the céntimo, so the occupants' shares added up never exceed the trip.
  perOccupantSoles: number;
  occupants: number;
}

export function estimateFuelCost(input: FuelCostInput): FuelCostEstimate {
  const {
    distanceKm,
    occupants,
    pricePerGallon = sources.gasolinePriceCentral.value,
    kmPerGallon = sources.fuelEconomy.value,
  } = input;
  if (!Number.isInteger(occupants) || occupants < 1) {
    throw new RangeError("Debe haber al menos un ocupante, el conductor");
  }
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new RangeError("Distancia del tramo inválida");
  }
  // Whole céntimos from here on: no float drift can push a share over the total.
  const tripCents = Math.round((distanceKm / kmPerGallon) * pricePerGallon * 100);
  const perOccupantCents = Math.floor(tripCents / occupants);
  return { tripSoles: tripCents / 100, perOccupantSoles: perOccupantCents / 100, occupants };
}

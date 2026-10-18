import { describe, expect, it } from "vitest";

import { estimateFuelCost } from "./index";

// The reference leg of the story (US-034), 15.45 km as written there (the OSRM matrix gives
// 15.77 km for La Molina → Centro Empresarial Real), at the central gasoline price of
// 17-10-2026 and the fuel economy that /datos documents.
const referenceLeg = { distanceKm: 15.45, pricePerGallon: 22.29, kmPerGallon: 35 };

describe("fuel cost of a shared leg", () => {
  it("splits the fuel of the leg among the four occupants of a full car", () => {
    const estimate = estimateFuelCost({ ...referenceLeg, occupants: 4 });

    expect(estimate).toEqual({ tripSoles: 9.84, perOccupantSoles: 2.46, occupants: 4 });
  });

  it.each([
    [2, 4.92],
    [3, 3.28],
  ])("with %i occupants each one's share of the same leg is S/ %s", (occupants, share) => {
    expect(estimateFuelCost({ ...referenceLeg, occupants }).perOccupantSoles).toBe(share);
  });

  // Centro Empresarial Real → Pentagonito, 10.6 km by OSRM: S/ 6,75 of fuel.
  it("rounds each share down to the céntimo: S/ 6,75 between two is S/ 3,37, not S/ 3,38", () => {
    const estimate = estimateFuelCost({ ...referenceLeg, distanceKm: 10.6, occupants: 2 });

    expect(estimate).toEqual({ tripSoles: 6.75, perOccupantSoles: 3.37, occupants: 2 });
  });

  it("never lets the shares of 1 to 7 occupants add up to more than the fuel of the leg", () => {
    for (let occupants = 1; occupants <= 7; occupants++) {
      const estimate = estimateFuelCost({ ...referenceLeg, distanceKm: 10.6, occupants });

      expect(estimate.perOccupantSoles * occupants).toBeLessThanOrEqual(estimate.tripSoles);
    }
  });

  it.each([0, 2.5, -1])(
    "refuses %s occupants: a car always carries at least its driver",
    (occupants) => {
      expect(() => estimateFuelCost({ ...referenceLeg, occupants })).toThrow(RangeError);
    },
  );

  it("refuses a negative or unknown distance instead of inventing a figure", () => {
    expect(() => estimateFuelCost({ ...referenceLeg, distanceKm: -1, occupants: 2 })).toThrow(
      RangeError,
    );
    expect(() => estimateFuelCost({ ...referenceLeg, distanceKm: NaN, occupants: 2 })).toThrow(
      RangeError,
    );
  });
});

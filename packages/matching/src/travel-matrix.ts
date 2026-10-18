import data from "./travel-matrix.json";
import type { FreeFlowMatrix } from "./travel-time";

// Free-flow driving times and distances between every pair of `places`, asked once to
// OSRM by scripts/build-travel-matrix.ts.
export interface TravelMatrix extends FreeFlowMatrix {
  source: string;
  license: string;
  retrievedAt: string;
  km: readonly (readonly (number | null)[])[];
}

export const travelMatrix: TravelMatrix = data;

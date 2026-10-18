import type { Objective } from "../optimizer";

// US-017's objective written again, apart from optimizer.ts, for the exhaustive optima:
// scripts/exhaustive-optima.ts finds them and optimizer-optimality.test.ts grades the
// optimizer against them. index.ts does not export it.

export const emptyPlan = (): Objective => ({
  carTripsAvoided: 0,
  passengersMatched: 0,
  detourMinutes: 0,
  walkMinutes: 0,
});

// Positive when `a` is the better plan: more car trips avoided, then more passengers,
// then fewer minutes of detour, then fewer on foot.
export function compareObjectives(a: Objective, b: Objective): number {
  return (
    a.carTripsAvoided - b.carTripsAvoided ||
    a.passengersMatched - b.passengersMatched ||
    b.detourMinutes - a.detourMinutes ||
    b.walkMinutes - a.walkMinutes
  );
}

import { describe, expect, it } from "vitest";

import { createTravelTimeModel, optimizeDay } from "./index";
import { compareObjectives } from "./testing/objective";
import { fingerprint, randomDay } from "./testing/random-day";
import smallDays from "./testing/small-days.json";

const model = createTravelTimeModel();

describe("the optimizer against the exhaustive optimum of 200 small days", () => {
  // Each optimum was found once by scripts/exhaustive-optima.ts, trying every assignment,
  // every pickup order and every meeting point.
  const days = smallDays.days.map((day) => {
    const instance = randomDay(day.seed, day.size, model);
    if (fingerprint(instance) !== day.fingerprint)
      throw new Error(`Day ${day.seed} changed: run \`bun run optima:build\` again`);
    return { ...day, plan: optimizeDay(instance, model).objective };
  });

  it("never finds a plan better than the optimum, which would mean the two disagree on the rules", () => {
    expect(days.filter((day) => compareObjectives(day.plan, day.optimum) > 0)).toEqual([]);
  });

  it("reaches the optimum in at least 95 % of the days", () => {
    const reached = days.filter((day) => compareObjectives(day.plan, day.optimum) === 0).length;

    expect(reached / days.length).toBeGreaterThanOrEqual(0.95);
  });
});

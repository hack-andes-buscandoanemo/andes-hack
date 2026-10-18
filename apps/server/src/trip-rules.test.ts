import { describe, expect, it } from "vitest";

import { hasPassed, limaClock } from "./trip-rules";

describe("hasPassed", () => {
  const clock = limaClock(new Date("2026-10-19T23:30:30.000Z")); // 18:30:30 in Lima

  it("treats a trip at 18:30 as passed at 18:30:30", () => {
    expect(hasPassed({ date: "2026-10-19", time: "18:30" }, clock)).toBe(true);
  });
  it("does not treat a trip at 18:30 as passed at exactly 18:30:00", () => {
    const exact = limaClock(new Date("2026-10-19T23:30:00.000Z"));
    expect(hasPassed({ date: "2026-10-19", time: "18:30" }, exact)).toBe(false);
    expect(hasPassed({ date: "2026-10-19", time: "18:30:00" }, exact)).toBe(false);
  });
  it("never ends a weekly trip by itself", () => {
    expect(hasPassed({ date: null, time: "01:00" }, clock)).toBe(false);
  });
});

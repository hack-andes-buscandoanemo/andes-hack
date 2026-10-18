import { describe, expect, it } from "vitest";

import { shiftClock } from "./schedule";

describe("shiftClock", () => {
  it("moves a time of day by the given minutes, also off the 15-minute slots", () => {
    expect(shiftClock("07:30", -15)).toBe("07:15");
    expect(shiftClock("08:30", 15)).toBe("08:45");
    expect(shiftClock("18:07", 15)).toBe("18:22");
  });

  it("does not cross midnight in either direction", () => {
    expect(shiftClock("23:50", 15)).toBe("23:59");
    expect(shiftClock("00:05", -15)).toBe("00:00");
  });
});

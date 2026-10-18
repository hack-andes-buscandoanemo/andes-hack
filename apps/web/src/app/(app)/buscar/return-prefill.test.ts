import { describe, expect, it } from "vitest";

import { parseReturnPrefill } from "./return-prefill";

const COMMUNITY_ID = "11111111-1111-4111-8111-111111111111";

const link = (overrides: Record<string, string | null> = {}) => {
  const params = new URLSearchParams({
    direction: "return",
    communityId: COMMUNITY_ID,
    originZoneId: "san-borja",
    windowStart: "18:00",
    windowEnd: "18:30",
    fallbackMode: "public_transport",
    date: "2026-11-02",
    ...overrides,
  } as Record<string, string>);
  for (const [key, value] of Object.entries(overrides)) if (value === null) params.delete(key);
  return params;
};

describe("parseReturnPrefill", () => {
  it("reads a one-off return link", () => {
    expect(parseReturnPrefill(link())).toEqual({
      communityId: COMMUNITY_ID,
      originZoneId: "san-borja",
      windowStart: "18:00",
      windowEnd: "18:30",
      fallbackMode: "public_transport",
      date: "2026-11-02",
      days: [],
    });
  });

  it("reads recurring weekdays instead of a date", () => {
    expect(parseReturnPrefill(link({ date: null, daysOfWeek: "1,3,5" }))).toMatchObject({
      date: null,
      days: [1, 3, 5],
    });
  });

  it.each([
    ["a date that does not exist", { date: "2026-02-30" }],
    ["a malformed date", { date: "02/11/2026" }],
    ["weekdays outside 1-7", { date: null, daysOfWeek: "1,8" }],
    ["repeated weekdays", { date: null, daysOfWeek: "1,1" }],
    ["weekdays that are not numbers", { date: null, daysOfWeek: "lunes" }],
    ["both a date and weekdays", { daysOfWeek: "1,3" }],
    ["neither a date nor weekdays", { date: null }],
    ["a window that ends before it starts", { windowStart: "18:30", windowEnd: "18:00" }],
    ["an empty window", { windowStart: "18:00", windowEnd: "18:00" }],
    ["a time that is not a clock time", { windowEnd: "25:00" }],
    ["an unknown fallback", { fallbackMode: "helicopter" }],
    ["no zone", { originZoneId: null }],
    ["no community", { communityId: null }],
  ])("rejects %s", (_name, overrides) => {
    expect(parseReturnPrefill(link(overrides))).toBeNull();
  });
});

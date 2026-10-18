import { FALLBACK_OPTIONS } from "./reasons";

export type ReturnPrefill = {
  communityId: string;
  originZoneId: string;
  windowStart: string;
  windowEnd: string;
  fallbackMode: (typeof FALLBACK_OPTIONS)[number]["value"];
  date: string | null;
  days: number[];
};

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

// Reads the "Buscar regreso" link; null when anything in it is not a usable search.
// Whether the zone exists in the community is checked later, when the zones arrive.
export function parseReturnPrefill(query: URLSearchParams): ReturnPrefill | null {
  const communityId = query.get("communityId");
  const originZoneId = query.get("originZoneId");
  const windowStart = query.get("windowStart") ?? "";
  const windowEnd = query.get("windowEnd") ?? "";
  const fallback = FALLBACK_OPTIONS.find((option) => option.value === query.get("fallbackMode"));
  if (!communityId || !originZoneId || !fallback) return null;
  if (!CLOCK.test(windowStart) || !CLOCK.test(windowEnd) || windowStart >= windowEnd) return null;
  if (query.has("date") === query.has("daysOfWeek")) return null;

  const base = { communityId, originZoneId, windowStart, windowEnd, fallbackMode: fallback.value };
  const date = query.get("date");
  if (date !== null) {
    const noon = new Date(`${date}T12:00:00Z`);
    const real =
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      Number.isFinite(noon.getTime()) &&
      noon.toISOString().slice(0, 10) === date;
    return real ? { ...base, date, days: [] } : null;
  }
  const weekdays = query.get("daysOfWeek") ?? "";
  const days = weekdays.split(",").map(Number);
  return /^[1-7](,[1-7])*$/.test(weekdays) && new Set(days).size === days.length
    ? { ...base, date: null, days }
    : null;
}

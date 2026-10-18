import { haversineKm } from "./geo";
import { places } from "./places";
import { type Source, type SourceKind, sources } from "./sources";
import { travelMatrix } from "./travel-matrix";

export interface PlacePoint {
  id: string;
  lat: number;
  lng: number;
}

// Free-flow minutes from `ids[row]` to `ids[column]`; null when there is no route.
export interface FreeFlowMatrix {
  ids: readonly string[];
  minutes: readonly (readonly (number | null)[])[];
}

export interface TravelTimeData {
  places: readonly PlacePoint[];
  matrix: FreeFlowMatrix;
}

export interface TravelTime {
  minutes: number;
  kind: SourceKind;
}

export interface TravelTimeModel {
  minutes(fromId: string, toId: string, departAt: Date): TravelTime;
  // Always an estimate: there is no walking matrix.
  walkMinutes(zoneId: string, meetingPointId: string): number;
}

// Peru has no daylight saving time: Lima is always UTC−5.
const limaOffsetMs = -5 * 60 * 60 * 1000;

// Weekday factors by Lima hour, in order, from 0 to 23 so every hour falls between two
// of them. Hours in between are interpolated linearly, an assumption of ours, so their
// times are `estimado`.
const weekdayAnchors: readonly { hour: number; factor: Source }[] = [
  { hour: 0, factor: sources.nightFactor },
  { hour: 4, factor: sources.nightFactor },
  { hour: 7, factor: sources.weekdayFactorAt7 },
  { hour: 8, factor: sources.weekdayFactorAt8 },
  { hour: 9, factor: sources.weekdayFactorAt9 },
  { hour: 18, factor: sources.weekdayFactorAt18 },
  { hour: 23, factor: sources.nightFactor },
];

function trafficFactor(departAt: Date): { value: number; kind: SourceKind } {
  // Shifted so its UTC fields read as the wall clock in Lima.
  const lima = new Date(departAt.getTime() + limaOffsetMs);
  const day = lima.getUTCDay();
  if (day === 0 || day === 6) return sources.weekendFactor;
  return weekdayFactor(lima.getUTCHours());
}

function weekdayFactor(hour: number): { value: number; kind: SourceKind } {
  const exact = weekdayAnchors.find((anchor) => anchor.hour === hour);
  if (exact) return exact.factor;

  const before = weekdayAnchors.findLast((anchor) => anchor.hour < hour);
  const after = weekdayAnchors.find((anchor) => anchor.hour > hour);
  if (!before || !after) throw new Error("Not implemented yet");

  const share = (hour - before.hour) / (after.hour - before.hour);
  const value = before.factor.value + share * (after.factor.value - before.factor.value);
  return { value, kind: "estimado" };
}

const lima: TravelTimeData = {
  places: [...places.zones, ...places.meetingPoints, ...places.destinations],
  matrix: travelMatrix,
};

// Built on the real places of Lima unless other data is given, as tests do.
export function createTravelTimeModel(data: TravelTimeData = lima): TravelTimeModel {
  const index = new Map(data.matrix.ids.map((id, position) => [id, position]));
  const placesById = new Map(data.places.map((place) => [place.id, place]));

  function place(id: string) {
    const found = placesById.get(id);
    if (!found) throw new Error(`Lugar desconocido: ${id}`);
    return found;
  }

  function freeFlowMinutes(fromId: string, toId: string) {
    const from = index.get(fromId);
    const to = index.get(toId);
    if (from === undefined || to === undefined) return null;
    return data.matrix.minutes[from]?.[to] ?? null;
  }

  // The straight line, stretched to street length.
  function streetKm(fromId: string, toId: string) {
    return haversineKm(place(fromId), place(toId)) * sources.circuityFactor.value;
  }

  // For a pair the matrix lacks.
  function estimatedFreeFlowMinutes(fromId: string, toId: string) {
    return (streetKm(fromId, toId) / sources.freeFlowSpeed.value) * 60;
  }

  return {
    minutes(fromId, toId, departAt) {
      const factor = trafficFactor(departAt);
      const freeFlow = freeFlowMinutes(fromId, toId);
      if (freeFlow === null) {
        const estimate = estimatedFreeFlowMinutes(fromId, toId);
        return { minutes: estimate * factor.value, kind: "estimado" };
      }
      return { minutes: freeFlow * factor.value, kind: factor.kind };
    },

    walkMinutes(zoneId, meetingPointId) {
      return (streetKm(zoneId, meetingPointId) / sources.walkingSpeed.value) * 60;
    },
  };
}

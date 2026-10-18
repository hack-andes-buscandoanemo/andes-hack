import { haversineKm } from "./geo";
import { places } from "./places";
import { type SourceKind, sources } from "./sources";
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
  // Street kilometres of the same pairs. Left out, every distance is an estimate.
  km?: readonly (readonly (number | null)[])[];
}

export interface TravelTimeData {
  places: readonly PlacePoint[];
  matrix: FreeFlowMatrix;
  // The places, among `places`, where a passenger can be picked up or dropped off. Left
  // out, the model knows no meeting points and no passenger can be matched.
  meetingPointIds?: readonly string[];
}

export interface TravelTime {
  minutes: number;
  kind: SourceKind;
}

export interface WalkableMeetingPoint {
  meetingPointId: string;
  walkMinutes: number;
}

export interface Distance {
  km: number;
  kind: SourceKind;
}

export interface TravelTimeModel {
  minutes(fromId: string, toId: string, departAt: Date): TravelTime;
  // Street kilometres by car between two places (the fuel estimate, US-034).
  distanceKm(fromId: string, toId: string): Distance;
  // Always an estimate: there is no walking matrix.
  walkMinutes(zoneId: string, meetingPointId: string): number;
  // Meeting points of any zone within the walk, nearest first.
  walkableMeetingPoints(zoneId: string, maxWalkMinutes: number): WalkableMeetingPoint[];
}

// How many times the free-flow time a trip takes, and whether that is a measured value.
interface TrafficFactor {
  value: number;
  kind: SourceKind;
}

// Peru has no daylight saving time: Lima is always UTC−5.
const limaOffsetMs = -5 * 60 * 60 * 1000;

// Weekday factors by Lima hour, in order, from 0 to 23 so every hour falls between two
// of them. Hours in between are interpolated linearly (sources.weekdayInterpolation), so
// their times are `estimado`.
const weekdayAnchors: readonly { hour: number; factor: TrafficFactor }[] = [
  { hour: 0, factor: sources.nightFactor },
  { hour: 4, factor: sources.nightFactor },
  { hour: 7, factor: sources.weekdayFactorAt7 },
  { hour: 8, factor: sources.weekdayFactorAt8 },
  { hour: 9, factor: sources.weekdayFactorAt9 },
  { hour: 18, factor: sources.weekdayFactorAt18 },
  { hour: 23, factor: sources.nightFactor },
];

function trafficFactor(departAt: Date): TrafficFactor {
  if (Number.isNaN(departAt.getTime())) throw new RangeError("Fecha de salida inválida");

  // Shifted so its UTC fields read as the wall clock in Lima.
  const wallClock = new Date(departAt.getTime() + limaOffsetMs);
  const day = wallClock.getUTCDay();
  if (day === 0 || day === 6) return sources.weekendFactor;
  return weekdayFactor(wallClock.getUTCHours());
}

function weekdayFactor(hour: number): TrafficFactor {
  const exact = weekdayAnchors.find((anchor) => anchor.hour === hour);
  if (exact) return exact.factor;

  const before = weekdayAnchors.findLast((anchor) => anchor.hour < hour);
  const after = weekdayAnchors.find((anchor) => anchor.hour > hour);
  // Unreachable while the anchors span 0 to 23.
  if (!before || !after) throw new Error(`Sin factor de tráfico para las ${hour}:00`);

  const share = (hour - before.hour) / (after.hour - before.hour);
  const value = before.factor.value + share * (after.factor.value - before.factor.value);
  return { value, kind: "estimado" };
}

const limaData: TravelTimeData = {
  places: [...places.zones, ...places.meetingPoints, ...places.destinations],
  matrix: travelMatrix,
  meetingPointIds: places.meetingPoints.map(({ id }) => id),
};

// Built on the real places of Lima unless other data is given, as tests do.
export function createTravelTimeModel(data: TravelTimeData = limaData): TravelTimeModel {
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

  function matrixKm(fromId: string, toId: string) {
    const from = index.get(fromId);
    const to = index.get(toId);
    if (from === undefined || to === undefined) return null;
    return data.matrix.km?.[from]?.[to] ?? null;
  }

  // The straight line, stretched to street length.
  function streetKm(fromId: string, toId: string) {
    return haversineKm(place(fromId), place(toId)) * sources.circuityFactor.value;
  }

  // For a pair the matrix lacks.
  function estimatedFreeFlowMinutes(fromId: string, toId: string) {
    return (streetKm(fromId, toId) / sources.freeFlowSpeed.value) * 60;
  }

  function walkMinutes(zoneId: string, meetingPointId: string) {
    return (streetKm(zoneId, meetingPointId) / sources.walkingSpeed.value) * 60;
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

    distanceKm(fromId, toId) {
      const km = matrixKm(fromId, toId);
      if (km === null) return { km: streetKm(fromId, toId), kind: "estimado" };
      return { km, kind: "dato" };
    },

    walkMinutes,

    walkableMeetingPoints(zoneId, maxWalkMinutes) {
      return (data.meetingPointIds ?? [])
        .map((meetingPointId) => ({
          meetingPointId,
          walkMinutes: walkMinutes(zoneId, meetingPointId),
        }))
        .filter((point) => point.walkMinutes <= maxWalkMinutes)
        .toSorted(
          (a, b) =>
            a.walkMinutes - b.walkMinutes || a.meetingPointId.localeCompare(b.meetingPointId),
        );
    },
  };
}

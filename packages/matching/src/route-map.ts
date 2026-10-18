import { type Places, places as limaPlaces } from "./places";
import { type LatLng, type RouteShape, routeShapes } from "./route-shapes";

// What the trip map draws (US-037): only the route, the public meeting points and the two
// ends of the trip. Never anyone's address or a car's live position.

export interface RouteMapTrip {
  direction: "outbound" | "return";
  // The driver's zone: where an outbound trip starts and a return trip ends.
  originZoneId: string;
  destinationId: string;
  // The meeting points the car stops at, in the order it reaches them.
  stops: readonly { meetingPointId: string; mine: boolean }[];
}

export interface RouteMarker {
  role: "start" | "end" | "meeting";
  name: string;
  lat: number;
  lng: number;
  mine: boolean;
}

export interface RouteMap {
  path: LatLng[];
  // True when part of the path is a straight line, not the streets.
  approximate: boolean;
  markers: RouteMarker[];
}

export interface RouteMapData {
  places: Pick<Places, "zones" | "meetingPoints" | "destinations">;
  shapes: readonly RouteShape[];
}

const limaData: RouteMapData = { places: limaPlaces, shapes: routeShapes.shapes };

export function routeMapFor(trip: RouteMapTrip, data: RouteMapData = limaData): RouteMap {
  const zone = data.places.zones.find((candidate) => candidate.id === trip.originZoneId);
  const destination = data.places.destinations.find(
    (candidate) => candidate.id === trip.destinationId,
  );
  if (!zone || !destination) throw new RangeError("Lugar desconocido");

  const stops = trip.stops.map((stop) => {
    const point = data.places.meetingPoints.find(
      (candidate) => candidate.id === stop.meetingPointId,
    );
    if (!point) throw new RangeError(`Punto de encuentro desconocido: ${stop.meetingPointId}`);
    return { ...point, mine: stop.mine };
  });

  const outbound = trip.direction === "outbound";
  const [start, end] = outbound ? [zone, destination] : [destination, zone];
  const streetsOf = (fromId: string, toId: string) =>
    data.shapes.find((candidate) => candidate.fromId === fromId && candidate.toId === toId)?.path ??
    null;

  const marker = (
    role: RouteMarker["role"],
    place: { name: string; lat: number; lng: number },
  ) => ({
    role,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    mine: false,
  });

  const markers = [
    marker("start", start),
    ...stops.map((stop) => ({ ...marker("meeting", stop), mine: stop.mine })),
    marker("end", end),
  ];

  const straight = markers.map(({ lat, lng }): LatLng => [lat, lng]);
  // Only zone ↔ sede drives have a shape. A stop in another zone is reached in a straight
  // line: going out, the streets start from the zone of the last stop; coming back, they
  // end at the zone of the first one.
  const leavesTheZone = stops.some((stop) => stop.zoneId !== zone.id);
  if (!leavesTheZone) {
    const streets = streetsOf(start.id, end.id);
    return streets
      ? { path: streets, approximate: false, markers }
      : { path: straight, approximate: true, markers };
  }

  const streets = outbound
    ? streetsOf(stops.at(-1)!.zoneId, end.id)
    : streetsOf(start.id, stops[0]!.zoneId);
  if (!streets) return { path: straight, approximate: true, markers };
  const path = outbound
    ? [...straight.slice(0, -1), ...streets]
    : [...streets, ...straight.slice(1)];
  return { path, approximate: true, markers };
}

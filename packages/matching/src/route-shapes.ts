import data from "./route-shapes.json";

export type LatLng = [lat: number, lng: number];

// The street shape of one drive, null when OSRM found no route.
export interface RouteShape {
  fromId: string;
  toId: string;
  path: LatLng[] | null;
}

// Every zone → sede and sede → zone drive, asked once to OSRM by
// scripts/build-route-shapes.ts. Only these pairs have a shape.
export interface RouteShapes {
  source: string;
  license: string;
  retrievedAt: string;
  shapes: RouteShape[];
}

// JSON widens each point to number[], hence the cast.
export const routeShapes = data as RouteShapes;

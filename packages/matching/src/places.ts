import data from "./places.json";

// Real places of Lima and Callao from OpenStreetMap. A zone stands for a district: no
// one's exact address is stored, only the district they travel from.

export type MeetingPointKind = "park" | "mall" | "rail_station" | "bus_stop" | "venue" | "other";

export interface Zone {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  osm: string;
  retrievedAt: string;
}

export interface MeetingPoint {
  id: string;
  zoneId: string;
  name: string;
  kind: MeetingPointKind;
  lat: number;
  lng: number;
  osm: string;
  retrievedAt: string;
}

export interface Destination {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  osm: string;
  retrievedAt: string;
}

export interface Places {
  source: string;
  license: string;
  zones: Zone[];
  meetingPoints: MeetingPoint[];
  destinations: Destination[];
}

// JSON widens `kind` to string, hence the cast.
export const places = data as Places;

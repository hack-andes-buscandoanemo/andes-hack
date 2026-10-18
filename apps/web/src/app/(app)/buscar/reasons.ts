import type { SearchTripsResponse } from "@/lib/communities-api";

type Reason = NonNullable<SearchTripsResponse["reason"]>;

// The engine decides the main reason; the web only words it.
export const REASON_MESSAGES: Record<Reason, string> = {
  outside_time_window: "Ningún conductor sale en ese horario",
  no_seats: "Los viajes cercanos ya están llenos",
  detour_exceeded: "El desvío superaría lo que aceptan los conductores",
  no_walkable_meeting_point: "No hay un punto de encuentro a una distancia caminable",
  days_mismatch: "Ningún conductor sale en esos días",
  women_only: "No hay viajes Solo mujeres que coincidan con tu búsqueda",
  previously_rejected: "No encontramos más viajes disponibles para este recorrido.",
  different_community: "No encontramos viajes compatibles",
  too_far_from_route: "Ninguna ruta pasa lo bastante cerca de tu origen y tu destino",
  wrong_direction: "Los viajes que pasan cerca van en sentido contrario al tuyo",
};

type FallbackMode = "drive_alone" | "taxi_app" | "public_transport" | "picked_up" | "other";

export const FALLBACK_OPTIONS: { value: FallbackMode; label: string }[] = [
  { value: "drive_alone", label: "Manejaría mi auto" },
  { value: "taxi_app", label: "Taxi o app" },
  { value: "public_transport", label: "Bus, combi, Corredor o metro" },
  { value: "picked_up", label: "Me recogen" },
  { value: "other", label: "Otro" },
];

// How the person got to the destination in the baseline question (US-011).
export const FALLBACK_FOR_USUAL_MODE: Record<string, FallbackMode> = {
  drove_alone: "drive_alone",
  drove_with_others: "drive_alone",
  car_passenger: "picked_up",
  public_transport: "public_transport",
  taxi_app: "taxi_app",
  other: "other",
};

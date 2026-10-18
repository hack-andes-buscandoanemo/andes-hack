"use client";

import { useMemo } from "react";

import { clockLabel } from "@/app/(app)/buscar/schedule";
import RouteMap from "@/components/route-map";
import type { RouteMap as RouteMapData, TripMatch } from "@/lib/communities-api";
import type { Coordinates } from "@/lib/geo";

// The trip of a search result on the map: where it starts and ends, the time it leaves, the
// person's meeting point, and, when known, where the person is and where they are going.
export default function SearchRouteMap({
  match,
  me,
  destination,
}: {
  match: TripMatch;
  me: Coordinates | null;
  destination: (Coordinates & { name: string }) | null;
}) {
  const route = useMemo<RouteMapData>(() => {
    const leaves = `sale ${clockLabel(match.departureTime.slice(0, 5))}`;
    const markers = match.routeMap.markers.map((marker) =>
      marker.role === "start" ? { ...marker, name: `${marker.name} · ${leaves}` } : marker,
    );
    // The person's own pins use the highlighted style of "my meeting point".
    if (me) markers.push({ role: "meeting", name: "Tú", ...me, mine: true });
    if (destination) {
      markers.push({
        role: "meeting",
        name: `Tu destino: ${destination.name}`,
        lat: destination.lat,
        lng: destination.lng,
        mine: true,
      });
    }
    return { ...match.routeMap, markers };
  }, [match, me, destination]);

  return <RouteMap route={route} />;
}

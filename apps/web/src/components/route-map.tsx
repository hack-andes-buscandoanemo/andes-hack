"use client";

import { useEffect, useRef, useState } from "react";

import type { RouteMap as RouteMapData } from "@/lib/communities-api";

// What the map reports: the first tiles arrived, or none will.
export interface TileEvents {
  onLoad(): void;
  onFail(): void;
}

// What removes the map; when it comes from the real map it also moves the live car and the
// suggested drop-off, which a stand-in map may leave out.
export type MapHandle = (() => void) & {
  setLivePosition?: (position: { lat: number; lng: number } | null) => void;
  setDropOff?: (point: { lat: number; lng: number; name: string } | null) => void;
};

export type DrawRouteMap = (
  container: HTMLElement,
  route: RouteMapData,
  events: TileEvents,
) => MapHandle;

// Leaflet is a separate chunk, downloaded only when a map is on screen.
const loadLeaflet = () => import("./leaflet-map").then((module) => module.drawRouteMap);

// The route as text: what a screen reader hears, and what everyone reads if the map fails.
function routeText(route: RouteMapData) {
  return route.markers
    .map((marker) => (marker.mine ? `${marker.name} (tu punto de encuentro)` : marker.name))
    .join(" → ");
}

export default function RouteMap({
  route,
  livePosition = null,
  dropOff = null,
  loadMap = loadLeaflet,
}: {
  route: RouteMapData;
  // Where the car is right now (Te Jalo); null while nobody shares it.
  livePosition?: { lat: number; lng: number } | null;
  // The stop suggested to the passenger, near where they are really going.
  dropOff?: { lat: number; lng: number; name: string } | null;
  loadMap?: () => Promise<DrawRouteMap>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const latest = useRef({ livePosition, dropOff });
  latest.current = { livePosition, dropOff };
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    handle.current?.setLivePosition?.(livePosition);
  }, [livePosition]);
  useEffect(() => {
    handle.current?.setDropOff?.(dropOff);
  }, [dropOff]);

  useEffect(() => {
    let active = true;
    let remove: MapHandle | undefined;
    setState("loading");
    loadMap()
      .then((draw) => {
        if (!active || !container.current) return;
        // The skeleton stays until there is a map to see.
        remove = draw(container.current, route, {
          onLoad: () => {
            if (active) setState("ready");
          },
          onFail: () => {
            if (active) setState("failed");
          },
        });
        handle.current = remove;
        // A position or stop that arrived while the map was loading is drawn now.
        remove.setLivePosition?.(latest.current.livePosition);
        remove.setDropOff?.(latest.current.dropOff);
      })
      .catch(() => {
        if (active) setState("failed");
      });
    return () => {
      active = false;
      handle.current = null;
      remove?.();
    };
  }, [route, loadMap]);

  const text = routeText(route);
  return (
    <div className="py-1">
      {/* Without a map the route is still there, in text, and the screen keeps working. */}
      {state === "failed" ? <p className="text-sm font-medium">{text}</p> : null}
      <div className="relative" hidden={state === "failed"}>
        {/* Leaflet draws in here, so it stays on the page (hidden if it failed) until unmount. */}
        <div
          ref={container}
          role="img"
          aria-label={text}
          className="isolate h-56 overflow-hidden rounded-xl border"
        />
        {state === "loading" ? (
          <div
            role="status"
            aria-label="Cargando mapa"
            className="absolute inset-0 animate-pulse rounded-xl bg-muted"
          />
        ) : null}
      </div>
      {route.approximate && state !== "failed" ? (
        <p className="pt-1 text-xs text-muted-foreground">Trazado aproximado</p>
      ) : null}
    </div>
  );
}

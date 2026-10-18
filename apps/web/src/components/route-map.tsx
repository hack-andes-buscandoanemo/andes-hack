"use client";

import { useEffect, useRef, useState } from "react";

import type { RouteMap as RouteMapData } from "@/lib/communities-api";

export type DrawRouteMap = (
  container: HTMLElement,
  route: RouteMapData,
  onFail: () => void,
) => () => void;

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
  loadMap = loadLeaflet,
}: {
  route: RouteMapData;
  loadMap?: () => Promise<DrawRouteMap>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let active = true;
    let remove: (() => void) | undefined;
    setState("loading");
    loadMap()
      .then((draw) => {
        if (!active || !container.current) return;
        // Ready first: the tiles may fail while the map is still being drawn.
        setState("ready");
        remove = draw(container.current, route, () => {
          if (active) setState("failed");
        });
      })
      .catch(() => {
        if (active) setState("failed");
      });
    return () => {
      active = false;
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

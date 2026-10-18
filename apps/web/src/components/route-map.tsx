"use client";

import { ArrowExpand01Icon, ArrowShrink01Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { RouteMap as RouteMapData } from "@/lib/communities-api";
import { cn } from "@/lib/utils";

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
  recenter?: () => void;
};

export type DrawRouteMap = (
  container: HTMLElement,
  route: RouteMapData,
  events: TileEvents,
) => MapHandle;

// Leaflet is a separate chunk, downloaded only when a map is on screen.
const loadLeaflet = () => import("./leaflet-map").then((module) => module.drawRouteMap);

async function defaultFetchSuggestedRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=false&steps=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      routes?: {
        duration: number;
        distance: number;
        geometry: { coordinates: [number, number][] };
      }[];
    };
    const best = body.routes?.[0];
    if (!best || best.geometry.coordinates.length < 2) return null;
    const path = best.geometry.coordinates.map(([lng, lat]): [number, number] => [lat, lng]);
    return {
      path,
      km: Math.round(best.distance / 100) / 10,
      minutes: Math.max(1, Math.round(best.duration / 60)),
    };
  } catch {
    return null;
  }
}

// The route as text: what a screen reader hears, and what everyone reads if the map fails.
function routeText(route: RouteMapData) {
  return route.markers
    .map((marker) => (marker.mine ? `${marker.name} (tu punto de encuentro)` : marker.name))
    .join(" → ");
}

export interface RouteMapProps {
  route: RouteMapData;
  // Where the car is right now (Te Jalo); null while nobody shares it.
  livePosition?: { lat: number; lng: number } | null;
  // The stop suggested to the passenger, near where they are really going.
  dropOff?: { lat: number; lng: number; name: string } | null;
  loadMap?: () => Promise<DrawRouteMap>;
  suggestRoute?: boolean;
  fetchSuggestedRoute?: (
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ) => Promise<{ path: [number, number][]; km: number; minutes: number } | null>;
  className?: string;
}

export default function RouteMap({
  route,
  livePosition = null,
  dropOff = null,
  loadMap = loadLeaflet,
  suggestRoute = false,
  fetchSuggestedRoute = defaultFetchSuggestedRoute,
  className,
}: RouteMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const latest = useRef({ livePosition, dropOff });
  latest.current = { livePosition, dropOff };
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [expanded, setExpanded] = useState(false);
  const [displayRoute, setDisplayRoute] = useState<RouteMapData>(route);
  const [suggestedMeta, setSuggestedMeta] = useState<{
    km: number;
    minutes: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    if (suggestRoute && route.approximate) {
      const start = route.markers.find((m) => m.role === "start");
      const end = route.markers.find((m) => m.role === "end");
      if (start && end) {
        fetchSuggestedRoute(start, end).then((suggested) => {
          if (!active || !suggested) return;
          setDisplayRoute({
            ...route,
            path: suggested.path,
            approximate: false,
          });
          setSuggestedMeta({ km: suggested.km, minutes: suggested.minutes });
        });
        return () => {
          active = false;
        };
      }
    }
    setDisplayRoute(route);
    setSuggestedMeta(null);
    return () => {
      active = false;
    };
  }, [route, suggestRoute, fetchSuggestedRoute]);

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
        remove = draw(container.current, displayRoute, {
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
  }, [displayRoute, loadMap]);

  const text = routeText(displayRoute);
  return (
    <div className="py-1">
      {/* Without a map the route is still there, in text, and the screen keeps working. */}
      {state === "failed" ? <p className="text-sm font-medium">{text}</p> : null}
      <div className="relative" hidden={state === "failed"}>
        {state === "ready" ? (
          <>
            {suggestedMeta ? (
              <div className="absolute top-2.5 left-2.5 z-[1000] flex items-center gap-1.5 rounded-lg border bg-background/95 px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Ruta sugerida por calles</span>
                <span className="text-muted-foreground">·</span>
                <span>
                  {suggestedMeta.km} km · ~{suggestedMeta.minutes} min
                </span>
              </div>
            ) : null}

            <div className="absolute top-2.5 right-2.5 z-[1000] flex items-center gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-8 rounded-lg border bg-background/90 shadow-sm backdrop-blur hover:bg-background"
                aria-label="Re-centrar ruta"
                onClick={() => handle.current?.recenter?.()}
              >
                <HugeiconsIcon icon={Location01Icon} className="size-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-8 rounded-lg border bg-background/90 shadow-sm backdrop-blur hover:bg-background"
                aria-label={expanded ? "Reducir mapa" : "Ampliar mapa"}
                onClick={() => {
                  setExpanded((prev) => !prev);
                  setTimeout(() => handle.current?.recenter?.(), 300);
                }}
              >
                <HugeiconsIcon
                  icon={expanded ? ArrowShrink01Icon : ArrowExpand01Icon}
                  className="size-4"
                  aria-hidden
                />
              </Button>
            </div>
          </>
        ) : null}

        {/* Leaflet draws in here, so it stays on the page (hidden if it failed) until unmount. */}
        <div
          ref={container}
          role="img"
          aria-label={text}
          className={cn(
            "isolate overflow-hidden rounded-xl border transition-all duration-300 ease-out",
            expanded ? "h-96 sm:h-[28rem]" : (className ?? "h-64 sm:h-72"),
          )}
        />
        {state === "loading" ? (
          <div
            role="status"
            aria-label="Cargando mapa"
            className="absolute inset-0 animate-pulse rounded-xl bg-muted"
          />
        ) : null}
      </div>
      {displayRoute.approximate && state !== "failed" ? (
        <p className="pt-1 text-xs text-muted-foreground">Trazado aproximado</p>
      ) : suggestedMeta && state !== "failed" ? (
        <p className="pt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          Ruta sugerida por calles
        </p>
      ) : null}
    </div>
  );
}

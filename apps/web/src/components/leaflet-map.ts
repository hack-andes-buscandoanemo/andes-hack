import "leaflet/dist/leaflet.css";

import L from "leaflet";

import type { RouteMap } from "@/lib/communities-api";

// The only module that knows Leaflet. route-map.tsx imports it dynamically, so the library
// is downloaded only on the screens that show a map.

// The provider has not answered by then: the person reads the route in text instead.
const tileTimeoutMs = 8000;

// Draws the route on `container` and returns what removes it. `onFail` runs once if the
// tiles do not load.
export function drawRouteMap(
  container: HTMLElement,
  route: RouteMap,
  onFail: () => void,
): () => void {
  const map = L.map(container, {
    // One finger scrolls the page on a phone; two move the map.
    dragging: !L.Browser.mobile,
    scrollWheelZoom: false,
  });

  // tile.openstreetmap.org asks for visible attribution and a Referer, which the app sends.
  // https://operations.osmfoundation.org/policies/tiles/
  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  let loaded = false;
  let failed = false;
  const fail = () => {
    if (loaded || failed) return;
    failed = true;
    onFail();
  };
  const timeout = setTimeout(fail, tileTimeoutMs);
  tiles.on("tileload", () => {
    loaded = true;
    clearTimeout(timeout);
  });
  tiles.on("tileerror", fail);

  const line = L.polyline(route.path, { className: "stroke-brand-black", weight: 4 }).addTo(map);

  for (const marker of route.markers) {
    const ends = marker.role !== "meeting";
    L.circleMarker([marker.lat, marker.lng], {
      radius: marker.mine ? 10 : ends ? 7 : 6,
      weight: 2,
      fillOpacity: 1,
      className: marker.mine
        ? "fill-brand-yellow stroke-brand-black"
        : ends
          ? "fill-brand-black stroke-white"
          : "fill-white stroke-brand-black",
    })
      // The ends and my point (yellow and bigger) are always labelled; the rest on tap.
      .bindTooltip(marker.name, { permanent: ends || marker.mine, direction: "top" })
      .addTo(map);
  }

  // A meeting point near the start may be off the line: fit every marker too.
  const bounds = line.getBounds();
  for (const marker of route.markers) bounds.extend([marker.lat, marker.lng]);
  map.fitBounds(bounds, { padding: [32, 32] });

  return () => {
    clearTimeout(timeout);
    map.remove();
  };
}

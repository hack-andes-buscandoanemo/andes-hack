import "leaflet/dist/leaflet.css";

import L from "leaflet";

import type { RouteMap } from "@/lib/communities-api";

import type { MapHandle, TileEvents } from "./route-map";

// The only module that knows Leaflet. route-map.tsx imports it dynamically, so the library
// is downloaded only on the screens that show a map.

// No tile by then: the person reads the route in text, until a late tile brings the map back.
const tileTimeoutMs = 8000;

// Draws the route on `container` and returns what removes it, which also moves the live car
// and the suggested drop-off. `onLoad` runs at the first tile; `onFail` if every tile of the
// view failed, or none arrived in time.
export function drawRouteMap(
  container: HTMLElement,
  route: RouteMap,
  { onLoad, onFail }: TileEvents,
): MapHandle {
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

  // One stray tile error is not a failed map: only a view with no tile at all is.
  let loaded = false;
  const fail = () => {
    if (!loaded) onFail();
  };
  const timeout = setTimeout(fail, tileTimeoutMs);
  tiles.on("tileload", () => {
    clearTimeout(timeout);
    if (loaded) return;
    loaded = true;
    onLoad();
  });
  // `load` fires once every tile of the view has answered, failed ones included.
  tiles.on("load", fail);

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

  // The car shown while the driver shares Te Jalo; it moves, it does not leave a trail.
  let car: L.Marker | null = null;
  let dropOff: L.CircleMarker | null = null;

  const remove = () => {
    clearTimeout(timeout);
    map.remove();
  };
  remove.setLivePosition = (position: { lat: number; lng: number } | null) => {
    if (!position) {
      car?.remove();
      car = null;
      return;
    }
    if (car) {
      car.setLatLng([position.lat, position.lng]);
      return;
    }
    car = L.marker([position.lat, position.lng], {
      icon: L.divIcon({
        className: "te-jalo-car",
        html: '<div style="font-size:26px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))">🚗</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
      zIndexOffset: 1000,
    })
      .bindTooltip("Conductor en vivo", { permanent: true, direction: "top" })
      .addTo(map);
  };
  remove.setDropOff = (point: { lat: number; lng: number; name: string } | null) => {
    dropOff?.remove();
    dropOff = null;
    if (!point) return;
    dropOff = L.circleMarker([point.lat, point.lng], {
      radius: 9,
      weight: 3,
      fillOpacity: 1,
      className: "fill-brand-yellow stroke-brand-black",
    })
      .bindTooltip(point.name, { permanent: true, direction: "bottom" })
      .addTo(map);
  };
  return remove;
}

import "leaflet/dist/leaflet.css";

import L from "leaflet";

import type { RouteMap } from "@/lib/communities-api";

import type { MapHandle, TileEvents } from "./route-map";

// The only module that knows Leaflet. route-map.tsx imports it dynamically, so the library
// is downloaded only on the screens that show a map.

// No tile by then: the person reads the route in text, until a late tile brings the map back.
const tileTimeoutMs = 8000;

function createPinIcon(type: "start" | "end" | "my-stop" | "stop") {
  if (type === "start") {
    return L.divIcon({
      className: "te-jalo-pin",
      html: '<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:#059669;color:#ffffff;border:2px solid #ffffff;box-shadow:0 4px 6px -1px rgba(0,0,0,0.35);font-size:13px;font-weight:700;line-height:1;font-family:system-ui,-apple-system,sans-serif;">A</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }
  if (type === "end") {
    return L.divIcon({
      className: "te-jalo-pin",
      html: '<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:#0f172a;color:#ffffff;border:2px solid #ffffff;box-shadow:0 4px 6px -1px rgba(0,0,0,0.35);font-size:13px;font-weight:700;line-height:1;font-family:system-ui,-apple-system,sans-serif;">B</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }
  if (type === "my-stop") {
    return L.divIcon({
      className: "te-jalo-pin",
      html: '<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:#facc15;color:#0f172a;border:2px solid #0f172a;box-shadow:0 4px 6px -1px rgba(0,0,0,0.35);font-size:13px;font-weight:800;line-height:1;font-family:system-ui,-apple-system,sans-serif;">★</div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }
  return L.divIcon({
    className: "te-jalo-pin",
    html: '<div style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:9999px;background:#ffffff;color:#0f172a;border:2px solid #0f172a;box-shadow:0 2px 4px rgba(0,0,0,0.25);font-size:8px;line-height:1;">●</div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

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
    zoomControl: false,
  });

  const isDark =
    container.closest(".dark") !== null ||
    (typeof document !== "undefined" && document.documentElement.classList.contains("dark"));

  // ESRI World Street Map (and Dark Canvas) provides high-contrast, clean street maps
  // with no API key required and no domain blocking.
  const tileUrl = isDark
    ? "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
    : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";

  const tiles = L.tileLayer(tileUrl, {
    maxZoom: 18,
    attribution: "Tiles &copy; Esri",
  }).addTo(map);

  if (isDark) {
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 18 },
    ).addTo(map);
  }

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

  // Outer casing: ensures contrast and depth over light or dark cartography.
  L.polyline(route.path, {
    className: "route-casing",
    color: isDark ? "#020617" : "#0f172a",
    weight: 7,
    opacity: 0.8,
    lineCap: "round",
    lineJoin: "round",
  }).addTo(map);

  // Inner line: vibrant brand yellow (#facc15) for high clarity.
  const line = L.polyline(route.path, {
    className: "route-inner stroke-brand-yellow",
    color: "#facc15",
    weight: 4.5,
    opacity: 1,
    lineCap: "round",
    lineJoin: "round",
    dashArray: route.approximate ? "8, 10" : undefined,
  }).addTo(map);

  for (const marker of route.markers) {
    const ends = marker.role !== "meeting";
    const iconType =
      marker.role === "start"
        ? "start"
        : marker.role === "end"
          ? "end"
          : marker.mine
            ? "my-stop"
            : "stop";

    L.marker([marker.lat, marker.lng], { icon: createPinIcon(iconType) })
      // The ends and my point are always labelled; the rest on tap.
      .bindTooltip(marker.name, {
        permanent: ends || marker.mine,
        direction: "top",
        offset: [0, -12],
      })
      .addTo(map);
  }

  // A meeting point near the start may be off the line: fit every marker too.
  const bounds = line.getBounds();
  for (const marker of route.markers) bounds.extend([marker.lat, marker.lng]);
  map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });

  // The car shown while the driver shares Te Jalo; it moves, it does not leave a trail.
  let car: L.Marker | null = null;
  let dropOff: L.CircleMarker | null = null;

  const remove: MapHandle = () => {
    clearTimeout(timeout);
    map.remove();
  };

  remove.recenter = () => {
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
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

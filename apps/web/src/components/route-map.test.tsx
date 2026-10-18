import { act, render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import RouteMap from "./route-map";

// San Isidro → San Borja with three meeting points, the story's example (US-037).
const ROUTE = {
  path: [
    [-12.0989, -77.0346],
    [-12.107, -76.9988],
  ] as [number, number][],
  approximate: false,
  markers: [
    { role: "start" as const, name: "San Isidro", lat: -12.0989, lng: -77.0346, mine: false },
    {
      role: "meeting" as const,
      name: "Parque El Olivar",
      lat: -12.1012,
      lng: -77.0347,
      mine: false,
    },
    {
      role: "meeting" as const,
      name: "Estación San Borja Sur (Línea 1)",
      lat: -12.1004,
      lng: -77.0018,
      mine: true,
    },
    {
      role: "meeting" as const,
      name: "Municipalidad de San Borja",
      lat: -12.1071,
      lng: -76.9991,
      mine: false,
    },
    { role: "end" as const, name: "San Borja", lat: -12.107, lng: -76.9988, mine: false },
  ],
};

const TEXT =
  "San Isidro → Parque El Olivar → Estación San Borja Sur (Línea 1) (tu punto de encuentro) → Municipalidad de San Borja → San Borja";

// Stands in for Leaflet: draws nothing, and the tiles load, fail or never answer.
function fakeMap({ tiles = "load" }: { tiles?: "load" | "fail" | "pending" } = {}) {
  return async () =>
    (_container: HTMLElement, _route: unknown, events: { onLoad(): void; onFail(): void }) => {
      if (tiles === "load") setTimeout(events.onLoad, 0);
      if (tiles === "fail") setTimeout(events.onFail, 0);
      return () => {};
    };
}

describe("the trip map (US-037)", () => {
  it("names the map with the route for screen readers once it is drawn", async () => {
    render(<RouteMap route={ROUTE} loadMap={fakeMap()} />);

    expect(await screen.findByRole("img", { name: TEXT })).toBeInTheDocument();
    expect(screen.queryByText(TEXT)).toBeNull();
  });

  it("notes when the line is straight because there is no street shape", async () => {
    render(<RouteMap route={{ ...ROUTE, approximate: true }} loadMap={fakeMap()} />);

    expect(await screen.findByText("Trazado aproximado")).toBeInTheDocument();
  });

  it("does not note a line that follows the streets", async () => {
    render(<RouteMap route={ROUTE} loadMap={fakeMap()} />);

    await screen.findByRole("img", { name: TEXT });
    expect(screen.queryByText("Trazado aproximado")).toBeNull();
  });

  it("shows a skeleton while the map is on its way", () => {
    render(<RouteMap route={ROUTE} loadMap={() => new Promise(() => {})} />);

    expect(screen.getByRole("status", { name: "Cargando mapa" })).toBeInTheDocument();
  });

  it("keeps the skeleton until the first tiles arrive, then shows the map", async () => {
    const { rerender } = render(<RouteMap route={ROUTE} loadMap={fakeMap({ tiles: "pending" })} />);

    await screen.findByRole("img", { name: TEXT });
    expect(screen.getByRole("status", { name: "Cargando mapa" })).toBeInTheDocument();

    const loading = fakeMap();
    rerender(<RouteMap route={ROUTE} loadMap={loading} />);
    await waitForElementToBeRemoved(() => screen.queryByRole("status", { name: "Cargando mapa" }));
  });

  it("falls back to the route in text when the tiles do not load", async () => {
    render(<RouteMap route={ROUTE} loadMap={fakeMap({ tiles: "fail" })} />);

    expect(await screen.findByText(TEXT)).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows the route in text when the map provider does not answer", async () => {
    render(<RouteMap route={ROUTE} loadMap={() => Promise.reject(new Error("offline"))} />);

    expect(
      await screen.findByText(
        "San Isidro → Parque El Olivar → Estación San Borja Sur (Línea 1) (tu punto de encuentro) → Municipalidad de San Borja → San Borja",
      ),
    ).toBeVisible();
  });

  it("renders a recenter button and calls recenter on map handle when clicked", async () => {
    const recenterMock = vi.fn();
    const loadMap =
      async () => (_container: HTMLElement, _route: unknown, events: { onLoad(): void }) => {
        setTimeout(events.onLoad, 0);
        const handle = () => {};
        handle.recenter = recenterMock;
        return handle;
      };

    render(<RouteMap route={ROUTE} loadMap={loadMap} />);
    const recenterBtn = await screen.findByRole("button", { name: "Re-centrar ruta" });
    recenterBtn.click();
    expect(recenterMock).toHaveBeenCalled();
  });

  it("toggles expanded map view when the expand button is clicked", async () => {
    render(<RouteMap route={ROUTE} loadMap={fakeMap()} />);
    const expandBtn = await screen.findByRole("button", { name: "Ampliar mapa" });
    await act(async () => {
      expandBtn.click();
    });
    expect(await screen.findByRole("button", { name: "Reducir mapa" })).toBeInTheDocument();
  });

  it("replaces approximate line with suggested street route when suggested route arrives", async () => {
    const suggestedPath: [number, number][] = [
      [-12.0989, -77.0346],
      [-12.1, -77.02],
      [-12.107, -76.9988],
    ];
    const fetchSuggested = vi.fn().mockResolvedValue({
      path: suggestedPath,
      km: 4.5,
      minutes: 12,
    });

    render(
      <RouteMap
        route={{ ...ROUTE, approximate: true }}
        loadMap={fakeMap()}
        fetchSuggestedRoute={fetchSuggested}
        suggestRoute
      />,
    );

    expect(await screen.findByText("Ruta sugerida por calles")).toBeInTheDocument();
    expect(await screen.findByText("4.5 km · ~12 min")).toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from "vitest";

import { osrmRoute, straightRoute } from "./routing";

describe("routing", () => {
  it("straightRoute creates interpolated steps between two points", () => {
    const from = { lat: -12.1005, lng: -77.0323 };
    const to = { lat: -12.0867, lng: -77.0037 };
    const route = straightRoute(from, to);

    expect(route.approximate).toBe(true);
    expect(route.path.length).toBeGreaterThan(2);
    expect(route.path[0]).toEqual([-12.1005, -77.0323]);
    expect(route.path[route.path.length - 1]).toEqual([-12.0867, -77.0037]);
  });

  it("osrmRoute passes User-Agent and parses route geometry on success", async () => {
    const from = { lat: -12.1, lng: -77.0 };
    const to = { lat: -12.0, lng: -76.9 };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [
          {
            duration: 600,
            distance: 5000,
            geometry: {
              coordinates: [
                [-77.0, -12.1],
                [-76.95, -12.05],
                [-76.9, -12.0],
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const route = await osrmRoute(from, to);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("https://router.project-osrm.org"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": expect.stringContaining("andes-hack-te-jalo"),
        }),
      }),
    );
    expect(route.approximate).toBe(false);
    expect(route.minutes).toBe(10);
    expect(route.km).toBe(5);
    expect(route.path).toEqual([
      [-12.1, -77.0],
      [-12.05, -76.95],
      [-12.0, -76.9],
    ]);

    vi.unstubAllGlobals();
  });

  it("osrmRoute falls back to straightRoute on fetch rejection", async () => {
    const from = { lat: -12.1, lng: -77.0 };
    const to = { lat: -12.0, lng: -76.9 };
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const route = await osrmRoute(from, to);

    expect(route.approximate).toBe(true);
    expect(route.path[0]).toEqual([-12.1, -77.0]);
    expect(route.path[route.path.length - 1]).toEqual([-12.0, -76.9]);

    vi.unstubAllGlobals();
  });
});

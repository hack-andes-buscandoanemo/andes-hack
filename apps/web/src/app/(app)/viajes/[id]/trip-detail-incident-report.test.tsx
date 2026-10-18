import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AxiosAdapter } from "axios";
import { afterEach, expect, it, vi } from "vitest";

import { httpClient } from "@/lib/http-client";

import TripDetailPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "22222222-2222-4222-8222-222222222222" }),
}));

const OFFER_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_ID = "u-driver";
const originalAdapter = httpClient.defaults.adapter;
let reportPayload: Record<string, unknown> | undefined;
vi.mock("@/components/leaflet-map", () => ({ drawRouteMap: () => () => {} }));

afterEach(() => {
  cleanup();
  httpClient.defaults.adapter = originalAdapter;
  reportPayload = undefined;
  vi.restoreAllMocks();
});

it("lets a passenger optionally identify the driver when reporting a trip", async () => {
  const adapter: AxiosAdapter = async (config) => {
    if (config.url === `/offers/${OFFER_ID}`) {
      return {
        data: {
          offerId: OFFER_ID,
          status: "active",
          driverName: "Mateo Q.",
          driverPhotoUrl: null,
          communityName: "Comunidad Alfa",
          originZoneName: "La Molina",
          destinationName: "Centro Empresarial Real",
          direction: "outbound",
          departureTime: "07:00:00",
          date: null,
          daysOfWeek: [1, 2, 3, 4, 5],
          seatsFree: 2,
          vehicle: null,
          note: null,
          isOwn: false,
          hasOpenNeed: false,
          match: null,
          booking: { id: "44444444-4444-4444-8444-444444444444", status: "accepted" },
          fuelEstimate: null,
          reportTargets: [
            { id: DRIVER_ID, name: "Mateo Q." },
            { id: "u-passenger", name: "Lucía R." },
          ],
          routeMap: {
            path: [],
            approximate: true,
            markers: [
              { role: "start", name: "La Molina", lat: -12.078, lng: -76.9173, mine: false },
              {
                role: "end",
                name: "Centro Empresarial Real",
                lat: -12.0975,
                lng: -77.0376,
                mine: false,
              },
            ],
          },
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    }
    if (config.url === "/incident-reports") {
      reportPayload = JSON.parse(String(config.data)) as Record<string, unknown>;
      return {
        data: {
          success: true,
          status: 201,
          data: {
            id: "55555555-5555-4555-8555-555555555555",
            status: "open",
            createdAt: "2026-10-18T17:30:00.000Z",
          },
        },
        status: 201,
        statusText: "Created",
        headers: {},
        config,
      };
    }
    throw new Error(`Unexpected HTTP request: ${config.method} ${config.url}`);
  };
  httpClient.defaults.adapter = adapter;
  const user = userEvent.setup();

  render(<TripDetailPage />);
  await user.click(await screen.findByRole("button", { name: "Reportar" }));
  expect(screen.getByRole("option", { name: "Mateo Q." })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Lucía R." })).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Tipo"), "dangerous_driving");
  await user.selectOptions(screen.getByLabelText("Persona reportada (opcional)"), DRIVER_ID);
  await user.click(screen.getByRole("button", { name: "Enviar reporte" }));

  expect(
    await screen.findByText(
      "Recibimos tu reporte. Tu identidad no se comparte con la persona reportada.",
    ),
  ).toBeInTheDocument();
  expect(reportPayload).toEqual({
    offerId: OFFER_ID,
    type: "dangerous_driving",
    reportedUserId: DRIVER_ID,
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import type { AxiosAdapter } from "axios";
import { afterEach, expect, it } from "vitest";

import { httpClient } from "@/lib/http-client";

import Panel from "./panel";

const originalAdapter = httpClient.defaults.adapter;

afterEach(() => {
  cleanup();
  httpClient.defaults.adapter = originalAdapter;
});

it("shows only the public aggregate and suppresses incident counts under ten", async () => {
  const adapter: AxiosAdapter = async (config) => {
    const data =
      config.url === "/communities"
        ? {
            communities: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                slug: "comunidad-alfa",
                name: "Comunidad Alfa",
                kind: "company",
                isDemo: false,
                hasEmailVerification: false,
                matchedEmailDomain: null,
              },
            ],
          }
        : {
            community: { name: "Comunidad Alfa", isDemo: false },
            updatedAt: "2026-10-18T17:30:00.000Z",
            activity: {
              enrolled: 0,
              drivers: 0,
              activeOffers: 0,
              openNeeds: 0,
              coverage: null,
              acceptedRequests: 0,
              completedTrips: 0,
              incidentReports: null,
            },
            waitlist: { institutions: 0, individuals: 0 },
            comparison: null,
            districts: [],
            people: { transported: 0, fromPublicTransport: 0 },
            vehicleImpact: {
              potential: { trips: 0, km: 0, co2Kg: 0 },
              verified: { trips: 0, km: 0, co2Kg: 0 },
              induced: 0,
              net: 0,
            },
          };
    return { data, status: 200, statusText: "OK", headers: {}, config };
  };
  httpClient.defaults.adapter = adapter;

  render(<Panel />);

  expect(await screen.findByText("Reportes de incidentes")).toBeInTheDocument();
  expect(screen.getByText("menos de 10")).toBeInTheDocument();
  expect(screen.queryByText("Recibimos tu reporte")).toBeNull();
});

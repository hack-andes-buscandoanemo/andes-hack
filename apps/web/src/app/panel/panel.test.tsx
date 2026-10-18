import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listCommunities = vi.fn();
const getPublicStats = vi.fn();

vi.mock("@/lib/communities-api", () => ({
  communitiesApi: {
    listCommunities: (...args: unknown[]) => listCommunities(...args),
    getPublicStats: (...args: unknown[]) => getPublicStats(...args),
  },
}));

import Panel from "./panel";

const ALFA = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "comunidad-alfa",
  name: "Comunidad Alfa",
  kind: "company" as const,
  isDemo: false,
  hasEmailVerification: true,
  matchedEmailDomain: null,
};

const BETA = {
  ...ALFA,
  id: "22222222-2222-4222-8222-222222222222",
  slug: "beta",
  name: "Beta",
  isDemo: true,
};

const STATS = {
  community: { name: "Comunidad Alfa", isDemo: false },
  updatedAt: "2026-10-19T15:04:05.000Z",
  activity: {
    enrolled: 12,
    drivers: 5,
    activeOffers: 4,
    openNeeds: 7,
    coverage: 0.5,
    acceptedRequests: 9,
    completedTrips: 3,
  },
  waitlist: { institutions: 2, individuals: 6 },
  districts: [
    { district: "La Molina", people: 11 },
    { district: "San Borja", people: null },
  ],
  people: { transported: 9, fromPublicTransport: 4 },
  vehicleImpact: {
    potential: { trips: 6, km: 40.5, co2Kg: 10.28 },
    verified: { trips: 2, km: 12.25, co2Kg: 3.11 },
    induced: 1,
    net: 5,
  },
};

beforeEach(() => {
  listCommunities.mockReset().mockResolvedValue([ALFA, BETA]);
  getPublicStats.mockReset().mockResolvedValue(STATS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Panel", () => {
  it("shows the activity cards of Comunidad Alfa without signing in", async () => {
    render(<Panel />);

    const card = async (label: string) =>
      (await screen.findByText(label)).closest("[data-card]") as HTMLElement;
    expect(within(await card("Personas inscritas")).getByText("12")).toBeInTheDocument();
    expect(getPublicStats).toHaveBeenCalledWith("comunidad-alfa");
    expect(within(await card("Conductores")).getByText("5")).toBeInTheDocument();
    expect(within(await card("Ofertas activas")).getByText("4")).toBeInTheDocument();
    expect(within(await card("Necesidades abiertas")).getByText("7")).toBeInTheDocument();
    expect(within(await card("Cobertura")).getByText("50 %")).toBeInTheDocument();
    expect(within(await card("Solicitudes aceptadas")).getByText("9")).toBeInTheDocument();
    expect(within(await card("Viajes completados")).getByText("3")).toBeInTheDocument();
  });

  it("keeps car trips avoided apart from the people transported", async () => {
    render(<Panel />);

    const vehicles = await screen.findByRole("region", { name: "Impacto vehicular" });
    expect(within(vehicles).getByText("Viajes en auto evitados")).toBeInTheDocument();
    expect(within(vehicles).getByText("Potenciales").nextSibling).toHaveTextContent("6");
    expect(within(vehicles).getByText("Verificados").nextSibling).toHaveTextContent("2");
    expect(within(vehicles).getByText("Inducidos").nextSibling).toHaveTextContent("1");
    expect(within(vehicles).getByText("Neto").nextSibling).toHaveTextContent("5");
    expect(within(vehicles).getByText("CO₂ evitado (estimado)")).toBeInTheDocument();
    expect(within(vehicles).queryByText("Personas transportadas")).not.toBeInTheDocument();

    const people = screen.getByRole("region", { name: "Beneficio para las personas" });
    expect(within(people).getByText("Personas transportadas").nextSibling).toHaveTextContent("9");
    expect(within(people).getByText("Desde transporte público").nextSibling).toHaveTextContent("4");
    expect(within(people).queryByText("Viajes en auto evitados")).not.toBeInTheDocument();
  });

  it("shows skeletons while the figures load", async () => {
    getPublicStats.mockReturnValue(new Promise(() => {}));

    render(<Panel />);

    expect(await screen.findByRole("status", { name: "Cargando el panel" })).toBeInTheDocument();
    expect(screen.queryByText("Personas inscritas")).not.toBeInTheDocument();
  });

  it("offers to retry when the panel cannot be loaded", async () => {
    getPublicStats.mockRejectedValueOnce(new Error("network"));
    render(<Panel />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar el panel.");

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Personas inscritas")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says there is no activity yet in an empty community", async () => {
    getPublicStats.mockResolvedValue({
      ...STATS,
      activity: {
        enrolled: 0,
        drivers: 0,
        activeOffers: 0,
        openNeeds: 0,
        coverage: null,
        acceptedRequests: 0,
        completedTrips: 0,
      },
      districts: [],
      people: { transported: 0, fromPublicTransport: 0 },
      vehicleImpact: {
        potential: { trips: 0, km: 0, co2Kg: 0 },
        verified: { trips: 0, km: 0, co2Kg: 0 },
        induced: 0,
        net: 0,
      },
    });

    render(<Panel />);

    expect(await screen.findByText("Aún no hay actividad en esta comunidad.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Impacto vehicular" })).not.toBeInTheDocument();
  });

  it("loads another community when it is picked in the selector", async () => {
    render(<Panel />);
    const selector = await screen.findByRole("combobox", { name: "Comunidad" });
    expect(
      within(selector)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Comunidad Alfa", "Beta"]);

    await userEvent.selectOptions(selector, "Beta");

    await waitFor(() => expect(getPublicStats).toHaveBeenLastCalledWith("beta"));
  });

  it("labels only demo communities as Datos sintéticos", async () => {
    render(<Panel />);
    await screen.findByText("Personas inscritas");
    expect(screen.queryByText("Datos sintéticos")).not.toBeInTheDocument();

    getPublicStats.mockResolvedValue({ ...STATS, community: { name: "Beta", isDemo: true } });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Comunidad" }), "Beta");

    expect(await screen.findByText("Datos sintéticos")).toBeInTheDocument();
  });

  it("shows the server time in Lima and links to the data page", async () => {
    render(<Panel />);

    expect(
      await screen.findByText("Actualizado a las 10:04:05 (hora del servidor)"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "¿Cómo calculamos esto?" })).toHaveAttribute(
      "href",
      "/datos",
    );
  });

  it("shows a district with few people as menos de 10", async () => {
    render(<Panel />);

    const districts = await screen.findByRole("region", { name: "Personas por distrito" });
    expect(within(districts).getByText("La Molina").nextSibling).toHaveTextContent("11");
    expect(within(districts).getByText("San Borja").nextSibling).toHaveTextContent("menos de 10");
  });

  it("shows the waitlist totals", async () => {
    render(<Panel />);

    const waitlist = await screen.findByRole("region", { name: "Lista de espera" });
    expect(within(waitlist).getByText("Instituciones").nextSibling).toHaveTextContent("2");
    expect(within(waitlist).getByText("Personas").nextSibling).toHaveTextContent("6");
  });

  it("refreshes by itself every 30 seconds without hiding the figures", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    render(<Panel />);
    await screen.findByText("Personas inscritas");
    expect(getPublicStats).toHaveBeenCalledTimes(1);

    getPublicStats.mockResolvedValue({ ...STATS, activity: { ...STATS.activity, enrolled: 13 } });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(getPublicStats).toHaveBeenCalledTimes(2);
    expect(getPublicStats).toHaveBeenLastCalledWith("comunidad-alfa");
    expect(await screen.findByText("13")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SERVER_URL = "http://localhost:3000";
});

import { httpClient } from "@/lib/http-client";

const communitiesResponse = vi.fn();
const statsResponse = vi.fn();
const originalAdapter = httpClient.defaults.adapter;

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
  comparison: null,
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
  communitiesResponse.mockReset().mockResolvedValue([ALFA, BETA]);
  statsResponse.mockReset().mockResolvedValue(STATS);
  httpClient.defaults.adapter = async (config) => {
    const data =
      config.url === "/communities"
        ? { communities: await communitiesResponse() }
        : await statsResponse(config.url);
    return { data, status: 200, statusText: "OK", headers: {}, config };
  };
});

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
  vi.useRealTimers();
});

describe("Panel", () => {
  it("separates optimizer recommendations from measured vehicle impact", async () => {
    statsResponse.mockResolvedValue({
      ...STATS,
      comparison: {
        date: "2026-10-19",
        direction: "outbound",
        optimizer: { carTripsAvoided: 8, passengersMatched: 11 },
        firstComeFirstServed: { carTripsAvoided: 5, passengersMatched: 7 },
      },
    });
    render(<Panel />);
    const comparison = await screen.findByRole("region", {
      name: "Optimizador vs. primero en llegar",
    });
    expect(
      within(comparison).getByText("Recomendaciones para el 2026-10-19 · Ida"),
    ).toBeInTheDocument();
    const optimizer = within(comparison).getByRole("group", { name: "Optimizador" });
    expect(within(optimizer).getByText("Viajes en auto evitados").nextSibling).toHaveTextContent(
      "8",
    );
    expect(within(optimizer).getByText("Personas emparejadas").nextSibling).toHaveTextContent("11");
    const fcfs = within(comparison).getByRole("group", { name: "Primero en llegar" });
    expect(within(fcfs).getByText("Viajes en auto evitados").nextSibling).toHaveTextContent("5");
    expect(within(fcfs).getByText("Personas emparejadas").nextSibling).toHaveTextContent("7");
  });
  it("finishes loading when there are no communities", async () => {
    communitiesResponse.mockResolvedValue([]);
    render(<Panel />);
    expect(await screen.findByText("Aún no hay comunidades disponibles.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("recovers on a successful poll after the initial request failed", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    statsResponse.mockRejectedValueOnce(new Error("network"));
    render(<Panel />);
    await screen.findByRole("alert");
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(await screen.findByText("Personas inscritas")).toBeInTheDocument();
  });
  it("shows the activity cards of Comunidad Alfa without signing in", async () => {
    render(<Panel />);

    const card = async (label: string) =>
      (await screen.findByText(label)).closest("[data-card]") as HTMLElement;
    expect(within(await card("Personas inscritas")).getByText("12")).toBeInTheDocument();
    expect(statsResponse).toHaveBeenCalledWith("/public/communities/comunidad-alfa/stats");
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
    statsResponse.mockReturnValue(new Promise(() => {}));

    render(<Panel />);

    expect(await screen.findByRole("status", { name: "Cargando el panel" })).toBeInTheDocument();
    expect(screen.queryByText("Personas inscritas")).not.toBeInTheDocument();
  });

  it("offers to retry when the panel cannot be loaded", async () => {
    statsResponse.mockRejectedValueOnce(new Error("network"));
    render(<Panel />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar el panel.");

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Personas inscritas")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says there is no activity yet in an empty community", async () => {
    statsResponse.mockResolvedValue({
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

    await waitFor(() =>
      expect(statsResponse).toHaveBeenLastCalledWith("/public/communities/beta/stats"),
    );
  });

  it("labels only demo communities as Datos sintéticos", async () => {
    render(<Panel />);
    await screen.findByText("Personas inscritas");
    expect(screen.queryByText("Datos sintéticos")).not.toBeInTheDocument();

    statsResponse.mockResolvedValue({ ...STATS, community: { name: "Beta", isDemo: true } });
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
    expect(within(waitlist).getByText("Totales de toda la plataforma.")).toBeInTheDocument();
    expect(within(waitlist).getByText("Instituciones").nextSibling).toHaveTextContent("2");
    expect(within(waitlist).getByText("Personas").nextSibling).toHaveTextContent("6");
  });

  it("refreshes by itself every 30 seconds without hiding the figures", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    render(<Panel />);
    await screen.findByText("Personas inscritas");
    expect(statsResponse).toHaveBeenCalledTimes(1);

    statsResponse.mockResolvedValue({ ...STATS, activity: { ...STATS.activity, enrolled: 13 } });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(statsResponse).toHaveBeenCalledTimes(2);
    expect(statsResponse).toHaveBeenLastCalledWith("/public/communities/comunidad-alfa/stats");
    expect(await screen.findByText("13")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not start a refresh while the previous one is still pending", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    render(<Panel />);
    await screen.findByText("Personas inscritas");
    statsResponse.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(statsResponse).toHaveBeenCalledTimes(2);
  });

  it("ignores the answer of a community that is no longer selected", async () => {
    let answerAlfa: (value: unknown) => void = () => {};
    statsResponse.mockImplementation((url: string) =>
      url.includes("comunidad-alfa")
        ? new Promise((resolve) => (answerAlfa = resolve))
        : Promise.resolve({ ...STATS, activity: { ...STATS.activity, enrolled: 77 } }),
    );
    render(<Panel />);
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Comunidad" }),
      "Beta",
    );
    expect(await screen.findByText("77")).toBeInTheDocument();

    await act(async () => answerAlfa(STATS));

    expect(screen.getByText("77")).toBeInTheDocument();
    expect(screen.queryByText("12")).not.toBeInTheDocument();
  });

  it("pauses the refresh while the tab is hidden and resumes when it is visible", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<Panel />);
    await screen.findByText("Personas inscritas");
    const initial = statsResponse.mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(90_000);
    });
    expect(statsResponse).toHaveBeenCalledTimes(initial);

    visibility.mockReturnValue("visible");
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(statsResponse).toHaveBeenCalledTimes(initial + 1);
    visibility.mockRestore();
  });

  it("announces the figures politely to screen readers", async () => {
    render(<Panel />);
    await screen.findByText("Personas inscritas");

    expect(screen.getByText("Personas inscritas").closest("[aria-live]")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });
});

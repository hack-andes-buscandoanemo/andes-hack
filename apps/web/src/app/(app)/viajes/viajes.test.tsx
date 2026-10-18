import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listMyTrips = vi.fn();
const updateOfferStatus = vi.fn();
let tab: string | null = null;

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (key: string) => (key === "tab" ? tab : null) }),
}));
vi.mock("@/lib/communities-api", () => ({
  communitiesApi: {
    listMyTrips: (...args: unknown[]) => listMyTrips(...args),
    updateOfferStatus: (...args: unknown[]) => updateOfferStatus(...args),
  },
}));

import Viajes from "./viajes";

const OFFER_ID = "22222222-2222-4222-8222-222222222222";
const BOOKING_ID = "44444444-4444-4444-8444-444444444444";

const PASSENGER_TRIP = {
  id: BOOKING_ID,
  offerId: OFFER_ID,
  role: "passenger" as const,
  status: "accepted" as const,
  direction: "outbound" as const,
  date: null,
  daysOfWeek: [1, 2, 3, 4, 5],
  time: "07:29:00",
  originZoneName: "La Molina",
  destinationName: "Centro Empresarial Real",
  meetingPointName: "Estación San Borja Sur (Línea 1)",
  driver: { alias: "Carlos Q.", plate: "ABC123" },
  pendingRequests: null,
  acceptedPassengers: null,
};

const DRIVER_TRIP = {
  ...PASSENGER_TRIP,
  id: OFFER_ID,
  role: "driver" as const,
  status: "active" as const,
  time: "07:00:00",
  meetingPointName: null,
  driver: null,
  pendingRequests: 2,
  acceptedPassengers: ["Lucía R."],
};

beforeEach(() => {
  tab = null;
  listMyTrips.mockReset().mockResolvedValue({ trips: [PASSENGER_TRIP] });
  updateOfferStatus.mockReset();
});

describe("Viajes", () => {
  it("shows an accepted trip under Próximos with its meeting point, driver and plate", async () => {
    render(<Viajes />);

    const card = await screen.findByRole("listitem");
    expect(listMyTrips).toHaveBeenCalledWith("passenger", "upcoming");
    expect(within(card).getByText("Ida")).toBeInTheDocument();
    expect(within(card).getByText("Aceptada")).toBeInTheDocument();
    expect(within(card).getByText("Lunes a viernes")).toBeInTheDocument();
    expect(within(card).getByText("7:29 a. m.")).toBeInTheDocument();
    expect(
      within(card).getByText("Punto de encuentro: Estación San Borja Sur (Línea 1)"),
    ).toBeInTheDocument();
    expect(within(card).getByText("Carlos Q.")).toBeInTheDocument();
    expect(within(card).getByText("Placa: ABC123")).toBeInTheDocument();
  });

  it("explains that there are no trips yet", async () => {
    listMyTrips.mockResolvedValue({ trips: [] });

    render(<Viajes />);

    expect(
      await screen.findByText("Aún no tienes viajes. Busca uno o publica el que ya haces."),
    ).toBeInTheDocument();
  });

  it("offers to retry when the trips cannot be loaded", async () => {
    listMyTrips.mockRejectedValueOnce(new Error("network"));
    render(<Viajes />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar tus viajes.");

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Aceptada")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("loads the past trips when opening Historial", async () => {
    render(<Viajes />);
    await screen.findByRole("listitem");
    listMyTrips.mockResolvedValue({
      trips: [{ ...PASSENGER_TRIP, status: "rejected", driver: null }],
    });

    await userEvent.click(screen.getByRole("tab", { name: "Historial" }));

    expect(await screen.findByText("Rechazada")).toBeInTheDocument();
    expect(listMyTrips).toHaveBeenLastCalledWith("passenger", "past");
    expect(screen.getByRole("tab", { name: "Historial" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Próximos" })).toHaveAttribute("aria-selected", "false");
  });

  it("announces that the trips are loading", async () => {
    render(<Viajes />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando viajes…");
    await screen.findByRole("listitem");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the driver's offers with their requests, read only", async () => {
    render(<Viajes />);
    await screen.findByRole("listitem");
    listMyTrips.mockResolvedValue({ trips: [DRIVER_TRIP] });

    await userEvent.click(screen.getByRole("button", { name: "Como conductor" }));

    const card = await screen.findByRole("listitem");
    expect(listMyTrips).toHaveBeenLastCalledWith("driver", "upcoming");
    expect(within(card).getByText("Activo")).toBeInTheDocument();
    expect(within(card).getByText("2 solicitudes pendientes")).toBeInTheDocument();
    expect(within(card).getByText("Pasajeros: Lucía R.")).toBeInTheDocument();
    expect(within(card).queryByText(/Placa/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Como conductor" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("pauses an active offer and lets the driver reactivate it", async () => {
    listMyTrips.mockResolvedValue({ trips: [DRIVER_TRIP] });
    updateOfferStatus.mockResolvedValueOnce({ id: OFFER_ID, status: "paused" });
    render(<Viajes />);
    await userEvent.click(screen.getByRole("button", { name: "Como conductor" }));

    await userEvent.click(await screen.findByRole("button", { name: "Pausar" }));

    expect(updateOfferStatus).toHaveBeenCalledWith(OFFER_ID, "paused");
    expect(await screen.findByText("Pausado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reactivar" })).toBeInTheDocument();
  });

  it("keeps the offer as it was when pausing fails", async () => {
    listMyTrips.mockResolvedValue({ trips: [DRIVER_TRIP] });
    updateOfferStatus.mockRejectedValueOnce(new Error("server"));
    render(<Viajes />);
    await userEvent.click(screen.getByRole("button", { name: "Como conductor" }));

    await userEvent.click(await screen.findByRole("button", { name: "Pausar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos actualizar el viaje. Inténtalo de nuevo.",
    );
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });

  it("opens on Historial when the profile link asks for it", async () => {
    tab = "historial";

    render(<Viajes />);

    await screen.findByRole("listitem");
    expect(listMyTrips).toHaveBeenCalledWith("passenger", "past");
    expect(screen.getByRole("tab", { name: "Historial" })).toHaveAttribute("aria-selected", "true");
  });

  it("links each trip to its detail", async () => {
    render(<Viajes />);

    const link = await screen.findByRole("link", { name: "Ver viaje" });

    expect(link).toHaveAttribute("href", `/viajes/${OFFER_ID}`);
  });

  it.each([
    ["pending", "Pendiente"],
    ["cancelled", "Cancelada"],
    ["completed", "Completada"],
    ["no_show", "No se presentó"],
  ] as const)("labels a %s request as %s and keeps the driver private", async (status, label) => {
    listMyTrips.mockResolvedValue({
      trips: [{ ...PASSENGER_TRIP, status, direction: "return", driver: null, date: "2026-10-20" }],
    });

    render(<Viajes />);

    const card = await screen.findByRole("listitem");
    expect(within(card).getByText(label)).toBeInTheDocument();
    expect(within(card).getByText("Regreso")).toBeInTheDocument();
    expect(within(card).getByText("Martes 20 de octubre")).toBeInTheDocument();
    expect(within(card).getByText("Centro Empresarial Real → La Molina")).toBeInTheDocument();
    expect(within(card).queryByText(/Placa/)).not.toBeInTheDocument();
  });
});

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MyTrip } from "@/lib/communities-api";

const listMyTrips = vi.fn();
const updateOfferStatus = vi.fn();
const createShareLink = vi.fn();
const cancelOffer = vi.fn();
const cancelBooking = vi.fn();
const push = vi.fn();
let tab: string | null = null;
let roleParam: string | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({
    get: (key: string) => (key === "tab" ? tab : key === "role" ? roleParam : null),
  }),
}));
vi.mock("@/lib/communities-api", () => ({
  communitiesApi: {
    listMyTrips: (...args: unknown[]) => listMyTrips(...args),
    updateOfferStatus: (...args: unknown[]) => updateOfferStatus(...args),
    createShareLink: (...args: unknown[]) => createShareLink(...args),
    cancelOffer: (...args: unknown[]) => cancelOffer(...args),
    cancelBooking: (...args: unknown[]) => cancelBooking(...args),
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
  progress: null,
  direction: "outbound" as const,
  date: null,
  daysOfWeek: [1, 2, 3, 4, 5],
  time: "07:29:00",
  originZoneName: "La Molina",
  destinationName: "Centro Empresarial Real",
  meetingPointName: "Estación San Borja Sur (Línea 1)",
  driver: { alias: "Carlos Q.", plate: "ABC123" },
  seatsTotal: null,
  seatsFree: null,
  pendingRequests: null,
  acceptedPassengers: null,
  fuelEstimate: { tripSoles: 10.04, perOccupantSoles: 5.02, occupants: 2 },
};

const DRIVER_TRIP = {
  ...PASSENGER_TRIP,
  id: OFFER_ID,
  role: "driver" as const,
  status: "active" as const,
  time: "07:00:00",
  meetingPointName: null,
  driver: null,
  seatsTotal: 3,
  seatsFree: 2,
  pendingRequests: 2,
  acceptedPassengers: ["Lucía R."],
};

const OUTBOUND: MyTrip = {
  ...PASSENGER_TRIP,
  passengerRequest: {
    communityId: "33333333-3333-4333-8333-333333333333",
    originZoneId: "la-molina",
    date: null,
    daysOfWeek: [1, 3],
    fallbackMode: "public_transport",
    returnWindow: { start: "18:00", end: "18:30" },
  },
};

const RETURN: MyTrip = {
  ...OUTBOUND,
  id: "55555555-5555-4555-8555-555555555555",
  offerId: "66666666-6666-4666-8666-666666666666",
  direction: "return",
  time: "18:10:00",
  daysOfWeek: [3, 4],
  passengerRequest: { ...OUTBOUND.passengerRequest!, daysOfWeek: [3, 5] },
};

beforeEach(() => {
  tab = null;
  roleParam = null;
  listMyTrips.mockReset().mockResolvedValue({ trips: [PASSENGER_TRIP] });
  updateOfferStatus.mockReset();
  createShareLink.mockReset().mockResolvedValue({ id: "link-1", token: "t", expiresAt: "" });
  cancelOffer.mockReset();
  cancelBooking.mockReset();
  push.mockReset();
});

describe("Viajes", () => {
  it("offers the day-of-trip buttons on accepted passenger trips and active driver trips only (US-025)", async () => {
    listMyTrips.mockResolvedValue({
      trips: [
        PASSENGER_TRIP,
        { ...PASSENGER_TRIP, id: "pending-1", status: "pending", driver: null },
        DRIVER_TRIP,
      ],
    });
    render(<Viajes />);

    await screen.findAllByRole("listitem");

    expect(screen.getAllByRole("button", { name: "Ya estoy en el auto" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Iniciar viaje" })).toHaveLength(1);
  });

  it("does not offer them in the history", async () => {
    tab = "historial";
    listMyTrips.mockResolvedValue({ trips: [{ ...PASSENGER_TRIP, status: "completed" }] });
    render(<Viajes />);

    await screen.findAllByRole("listitem");

    expect(screen.queryByRole("button", { name: "Ya estoy en el auto" })).not.toBeInTheDocument();
  });

  it("lists each day a weekly seat travelled in the history, with its outcome", async () => {
    tab = "historial";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    listMyTrips.mockResolvedValue({
      trips: [
        { ...PASSENGER_TRIP, status: "completed", progress: "arrived", date: "2026-10-26" },
        { ...PASSENGER_TRIP, status: "no_show", progress: null, date: "2026-10-19" },
      ],
    });
    render(<Viajes />);

    const items = await screen.findAllByRole("listitem");

    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Completada")).toBeInTheDocument();
    expect(within(items[1]!).getByText("No se presentó")).toBeInTheDocument();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("offers Compartir viaje on an accepted passenger trip and nowhere else (US-028)", async () => {
    listMyTrips.mockResolvedValue({
      trips: [
        PASSENGER_TRIP,
        { ...PASSENGER_TRIP, id: "pending-1", status: "pending", driver: null },
        DRIVER_TRIP,
      ],
    });
    render(<Viajes />);

    await screen.findAllByRole("listitem");

    expect(screen.getAllByRole("button", { name: "Compartir viaje" })).toHaveLength(1);
  });

  it("shares the booking of the trip, not the offer", async () => {
    render(<Viajes />);

    await userEvent.click(await screen.findByRole("button", { name: "Compartir viaje" }));

    expect(createShareLink).toHaveBeenCalledWith(BOOKING_ID);
    expect(createShareLink).not.toHaveBeenCalledWith(OFFER_ID);
  });

  it.each([
    ["pending", { ...RETURN, status: "pending" }],
    ["driver", { ...RETURN, role: "driver" }],
    ["outbound", { ...RETURN, direction: "outbound", passengerRequest: undefined }],
    ["missing passenger context", { ...RETURN, passengerRequest: undefined }],
    [
      "another community",
      { ...RETURN, passengerRequest: { ...RETURN.passengerRequest!, communityId: "other" } },
    ],
    [
      "another zone",
      { ...RETURN, passengerRequest: { ...RETURN.passengerRequest!, originZoneId: "other" } },
    ],
    ["unsupported return offer days", { ...RETURN, daysOfWeek: [2, 4] }],
    [
      "unsupported return request days",
      { ...RETURN, passengerRequest: { ...RETURN.passengerRequest!, daysOfWeek: [5] } },
    ],
    [
      "return offer outside the request date",
      {
        ...RETURN,
        passengerRequest: { ...RETURN.passengerRequest!, date: "2099-03-02", daysOfWeek: null },
      },
    ],
    [
      "conflicting one-off return calendars",
      {
        ...RETURN,
        date: "2099-03-02",
        daysOfWeek: null,
        passengerRequest: { ...RETURN.passengerRequest!, date: "2099-03-04", daysOfWeek: null },
      },
    ],
  ] satisfies [string, MyTrip][])(
    "keeps %s trips separate from the accepted ida",
    async (_, trip) => {
      listMyTrips.mockResolvedValue({ trips: [OUTBOUND, trip] });
      render(<Viajes />);

      await screen.findAllByRole("region", { name: "¿Y el regreso?" });
      expect(screen.queryByRole("region", { name: /^Ida y regreso:/ })).not.toBeInTheDocument();
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
    },
  );

  it("keeps accepted trips on different dates separate", async () => {
    listMyTrips.mockResolvedValue({
      trips: [
        {
          ...OUTBOUND,
          date: "2099-03-02",
          daysOfWeek: null,
          passengerRequest: { ...OUTBOUND.passengerRequest!, date: "2099-03-02", daysOfWeek: null },
        },
        {
          ...RETURN,
          date: "2099-03-04",
          daysOfWeek: null,
          passengerRequest: { ...RETURN.passengerRequest!, date: "2099-03-04", daysOfWeek: null },
        },
      ],
    });
    render(<Viajes />);

    await screen.findByRole("region", { name: "¿Y el regreso?" });
    expect(screen.queryByRole("region", { name: /^Ida y regreso:/ })).not.toBeInTheDocument();
  });

  it("does not pair a return that leaves before the outward trip", async () => {
    listMyTrips.mockResolvedValue({ trips: [OUTBOUND, { ...RETURN, time: "06:00:00" }] });
    render(<Viajes />);

    await screen.findByRole("region", { name: "¿Y el regreso?" });
    expect(screen.queryByRole("region", { name: /^Ida y regreso:/ })).not.toBeInTheDocument();
  });

  it("links a dated return to a recurring outward trip only on its effective date", async () => {
    listMyTrips.mockResolvedValue({
      trips: [
        OUTBOUND,
        {
          ...RETURN,
          date: "2099-03-02",
          daysOfWeek: null,
          passengerRequest: { ...RETURN.passengerRequest!, date: "2099-03-02", daysOfWeek: null },
        },
      ],
    });
    render(<Viajes />);

    const pair = await screen.findByRole("region", { name: "Ida y regreso: Lunes 2 de marzo" });
    expect(within(pair).getByRole("link", { name: "Regreso · 6:10 p. m." })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Ida y regreso: Lunes y miércoles" })).toBeNull();
  });

  it("shows accepted ida and regreso together only for their common effective days", async () => {
    listMyTrips.mockResolvedValue({ trips: [OUTBOUND, RETURN] });
    render(<Viajes />);

    const pair = await screen.findByRole("region", { name: "Ida y regreso: Miércoles" });
    expect(within(pair).getByRole("link", { name: "Ida · 7:29 a. m." })).toHaveAttribute(
      "href",
      `/viajes/${OFFER_ID}`,
    );
    expect(within(pair).getByRole("link", { name: "Regreso · 6:10 p. m." })).toHaveAttribute(
      "href",
      "/viajes/66666666-6666-4666-8666-666666666666",
    );
    expect(within(pair).queryByText(/Lunes|Jueves|Viernes/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("offers return coordination after an accepted outward trip", async () => {
    listMyTrips.mockResolvedValue({ trips: [OUTBOUND] });
    render(<Viajes />);

    const coordination = await screen.findByRole("region", { name: "¿Y el regreso?" });
    expect(within(coordination).getByText("Lunes y miércoles")).toBeInTheDocument();
    await userEvent.click(within(coordination).getByRole("button", { name: "Buscar regreso" }));
    expect(push).toHaveBeenCalledWith(
      "/buscar?direction=return&communityId=33333333-3333-4333-8333-333333333333&originZoneId=la-molina&windowStart=18%3A00&windowEnd=18%3A30&fallbackMode=public_transport&daysOfWeek=1%2C3",
    );
  });

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

  it("shows the estimated fuel contribution on each trip, as a reference without any payment (US-034)", async () => {
    render(<Viajes />);

    const card = await screen.findByRole("listitem");
    expect(
      within(card).getByText("Aporte de combustible estimado: S/ 5,02 por persona"),
    ).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "De dónde sale esta cifra" })).toHaveAttribute(
      "href",
      "/datos#impacto",
    );
    expect(
      screen.getByText(
        "Referencial. Te Jalo no cobra ni procesa pagos: el precio lo fija quien maneja y se paga directamente con Yape o efectivo.",
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/pagar|saldo|deuda|Métodos de pago/i);
  });

  it("says when a trip's fuel could not be estimated", async () => {
    listMyTrips.mockResolvedValue({ trips: [{ ...PASSENGER_TRIP, fuelEstimate: null }] });

    render(<Viajes />);

    const card = await screen.findByRole("listitem");
    expect(
      within(card).getByText("No pudimos estimar el combustible de este tramo."),
    ).toBeInTheDocument();
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
    expect(within(card).getByText("2 de 3 asientos libres")).toBeInTheDocument();
    expect(within(card).getByText("2 solicitudes pendientes")).toBeInTheDocument();
    expect(within(card).getByText("Pasajeros: Lucía R.")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Solicitudes" })).toHaveAttribute(
      "href",
      `/viajes/${OFFER_ID}/solicitudes`,
    );
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

  it("opens on Como conductor when the person has no trips as passenger but does as driver", async () => {
    listMyTrips.mockImplementation(async (role: string) => ({
      trips: role === "driver" ? [DRIVER_TRIP] : [],
    }));

    render(<Viajes />);

    expect(await screen.findByText("Activo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Como conductor" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("stays on Como pasajero when the link asks for it, even with no passenger trips", async () => {
    roleParam = "pasajero";
    listMyTrips.mockImplementation(async (role: string) => ({
      trips: role === "driver" ? [DRIVER_TRIP] : [],
    }));

    render(<Viajes />);

    expect(
      await screen.findByText("Aún no tienes viajes. Busca uno o publica el que ya haces."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Como pasajero" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("opens on Como conductor when the link asks for it", async () => {
    roleParam = "conductor";

    render(<Viajes />);

    await screen.findByRole("listitem");
    expect(listMyTrips).toHaveBeenCalledWith("driver", "upcoming");
    expect(listMyTrips).not.toHaveBeenCalledWith("passenger", "upcoming");
  });

  it("sends one request when Pausar is tapped twice and shows the status the server answers", async () => {
    listMyTrips.mockResolvedValue({ trips: [DRIVER_TRIP] });
    let answer: (value: { id: string; status: string }) => void = () => {};
    updateOfferStatus.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    render(<Viajes />);
    await userEvent.click(screen.getByRole("button", { name: "Como conductor" }));
    const button = await screen.findByRole("button", { name: "Pausar" });

    await userEvent.dblClick(button);

    expect(updateOfferStatus).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(screen.getByText("Activo")).toBeInTheDocument();

    answer({ id: OFFER_ID, status: "paused" });

    expect(await screen.findByText("Pausado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reactivar" })).toBeEnabled();
  });

  it("wires each tab to the panel that holds its trips", async () => {
    render(<Viajes />);
    await screen.findByRole("listitem");

    const panel = screen.getByRole("tabpanel");
    const selected = screen.getByRole("tab", { name: "Próximos" });

    expect(selected).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", selected.id);
    expect(within(panel).getByRole("listitem")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Historial" })).toHaveAttribute("tabindex", "-1");
  });

  it("moves between the tabs with the arrow keys", async () => {
    render(<Viajes />);
    await screen.findByRole("listitem");

    screen.getByRole("tab", { name: "Próximos" }).focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "Historial" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Historial" })).toHaveFocus();
  });

  it("switches to Historial when the link changes while already on Viajes", async () => {
    const { rerender } = render(<Viajes />);
    await screen.findByRole("listitem");

    tab = "historial";
    rerender(<Viajes />);

    await waitFor(() => expect(listMyTrips).toHaveBeenLastCalledWith("passenger", "past"));
    expect(screen.getByRole("tab", { name: "Historial" })).toHaveAttribute("aria-selected", "true");
  });

  it("lets the driver cancel a trip from the list with reasons dialog (US-022)", async () => {
    listMyTrips.mockImplementation(async (role: string) => ({
      trips: role === "driver" ? [DRIVER_TRIP] : [],
    }));
    cancelOffer.mockResolvedValue({
      offer: { id: OFFER_ID, status: "cancelled" },
      lateCancelled: false,
      affectedBookings: [],
    });
    const user = userEvent.setup();
    render(<Viajes />);

    await user.click(screen.getByRole("button", { name: "Como conductor" }));
    const cancelBtn = await screen.findByRole("button", { name: "Cancelar viaje" });
    await user.click(cancelBtn);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("¿Cancelar este viaje?")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Cambié de horario"));
    await user.click(screen.getByRole("button", { name: "Sí, cancelar" }));

    expect(cancelOffer).toHaveBeenCalledWith(OFFER_ID);
    expect(await screen.findByText("Cancelada")).toBeInTheDocument();
  });

  it("lets the passenger cancel an accepted trip from the list with reasons dialog (US-022)", async () => {
    listMyTrips.mockResolvedValue({ trips: [PASSENGER_TRIP] });
    cancelBooking.mockResolvedValue({
      booking: { id: BOOKING_ID, status: "cancelled_by_passenger" },
      lateCancelled: false,
    });
    const user = userEvent.setup();
    render(<Viajes />);

    const cancelBtn = await screen.findByRole("button", { name: "Cancelar viaje" });
    await user.click(cancelBtn);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByLabelText("No iré a la sede"));
    await user.click(screen.getByRole("button", { name: "Sí, cancelar" }));

    expect(cancelBooking).toHaveBeenCalledWith(BOOKING_ID);
    expect(await screen.findByText("Cancelada")).toBeInTheDocument();
  });
});

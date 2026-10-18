import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { serverError } from "@/test/server-error";

const getOfferDetail = vi.fn();
const requestSeat = vi.fn();
const cancelBooking = vi.fn();

vi.mock("next/navigation", () => ({ useParams: () => ({ id: currentId }) }));
vi.mock("@/lib/communities-api", () => ({
  communitiesApi: {
    getOfferDetail: (...args: unknown[]) => getOfferDetail(...args),
    requestSeat: (...args: unknown[]) => requestSeat(...args),
    cancelBooking: (...args: unknown[]) => cancelBooking(...args),
  },
}));

import TripDetailPage from "./page";

const OFFER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "33333333-3333-4333-8333-333333333333";
let currentId = OFFER_ID;

const DETAIL = {
  offerId: OFFER_ID,
  status: "active" as const,
  driverName: "Mateo Q.",
  communityName: "Comunidad Alfa",
  originZoneName: "La Molina",
  destinationName: "Centro Empresarial Real",
  direction: "outbound" as const,
  departureTime: "07:00:00",
  date: null,
  daysOfWeek: [1, 2, 3, 4, 5],
  seatsFree: 3,
  vehicle: { make: "Toyota", model: "Corolla", plate: null },
  note: "Salgo puntual",
  isOwn: false,
  match: {
    meetingPointName: "Estación San Borja Sur (Línea 1)",
    pickupAt: "07:29",
    arrivalAt: "07:44",
    detourMinutes: 6,
    walkMinutes: 14,
  },
  booking: null,
};

beforeEach(() => {
  currentId = OFFER_ID;
  getOfferDetail.mockReset().mockResolvedValue(DETAIL);
  requestSeat.mockReset();
  cancelBooking.mockReset();
});

describe("trip detail /viajes/{id} (US-014)", () => {
  it("shows the driver, the route, the schedule and the conditions before asking for a seat", async () => {
    render(<TripDetailPage />);

    expect(await screen.findByText("Mateo Q.")).toBeTruthy();
    expect(screen.getAllByText("Miembro verificado").length).toBeGreaterThan(0);
    expect(screen.getByText("Comunidad Alfa")).toBeTruthy();
    expect(screen.getByText("La Molina → Centro Empresarial Real")).toBeTruthy();
    expect(screen.getByText("Viaje recurrente: Lunes a viernes")).toBeTruthy();
    expect(screen.getByText("Salida: 7:00 a. m.")).toBeTruthy();
    expect(screen.getByText("Llegada estimada: 7:44 a. m.")).toBeTruthy();
    expect(screen.getByText("3 asientos disponibles")).toBeTruthy();
    expect(screen.getByText("Desvío estimado: 6 min")).toBeTruthy();
    expect(screen.getByText("Vehículo: Toyota Corolla")).toBeTruthy();
    expect(screen.getByText("Salgo puntual")).toBeTruthy();
    expect(screen.getByText("Espera máxima: 3 min")).toBeTruthy();
    expect(screen.getByText("Sin tarifa: Te Jalo no cobra")).toBeTruthy();
    expect(screen.getByText("Puedes cancelar cuando quieras")).toBeTruthy();
    expect(screen.getByText("Estación San Borja Sur (Línea 1)")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/ABC123/);
  });

  it("shows the date of a one-off trip instead of recurring days", async () => {
    getOfferDetail.mockResolvedValue({ ...DETAIL, daysOfWeek: null, date: "2026-10-20" });
    render(<TripDetailPage />);

    expect(await screen.findByText("Martes 20 de octubre")).toBeTruthy();
    expect(screen.queryByText(/Viaje recurrente/)).toBeNull();
  });

  it("names the days of an irregular recurring trip", async () => {
    getOfferDetail.mockResolvedValue({ ...DETAIL, daysOfWeek: [5, 1, 3] });
    render(<TripDetailPage />);

    expect(await screen.findByText("Viaje recurrente: Lunes, miércoles y viernes")).toBeTruthy();
  });

  it("explains that the plate appears once the driver accepts, and shows it afterwards", async () => {
    const { unmount } = render(<TripDetailPage />);
    expect(await screen.findByText("La placa se muestra cuando el conductor acepte.")).toBeTruthy();
    unmount();

    getOfferDetail.mockResolvedValue({
      ...DETAIL,
      vehicle: { make: "Toyota", model: "Corolla", plate: "ABC123" },
      booking: { id: "b-1", status: "accepted" },
    });
    render(<TripDetailPage />);

    expect(await screen.findByText("Placa: ABC123")).toBeTruthy();
    expect(screen.queryByText("La placa se muestra cuando el conductor acepte.")).toBeNull();
  });

  it("sends the request with the optional message and confirms it", async () => {
    requestSeat.mockResolvedValue({ booking: { id: "b-1", status: "pending" } });
    const user = userEvent.setup();
    render(<TripDetailPage />);

    await user.type(
      await screen.findByLabelText("Mensaje para el conductor (opcional)"),
      "Voy con una mochila",
    );
    await user.click(screen.getByRole("button", { name: "Solicitar asiento" }));

    expect(
      await screen.findByText("Solicitud enviada. Te avisaremos cuando Mateo Q. responda."),
    ).toBeTruthy();
    expect(requestSeat).toHaveBeenCalledWith(OFFER_ID, "Voy con una mochila");
    expect(screen.queryByRole("button", { name: "Solicitar asiento" })).toBeNull();
  });

  it("shows the server's reason when the seat cannot be requested and keeps the request unsent", async () => {
    requestSeat.mockRejectedValue(serverError(409, "Ya solicitaste un asiento en este viaje."));
    const user = userEvent.setup();
    render(<TripDetailPage />);

    await user.click(await screen.findByRole("button", { name: "Solicitar asiento" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Ya solicitaste un asiento en este viaje.",
    );
    expect(screen.queryByText(/Solicitud enviada/)).toBeNull();
  });

  it("falls back to a generic message when the server does not answer", async () => {
    requestSeat.mockRejectedValue(new Error("Network Error"));
    const user = userEvent.setup();
    render(<TripDetailPage />);

    await user.click(await screen.findByRole("button", { name: "Solicitar asiento" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "No pudimos enviar tu solicitud. Inténtalo de nuevo.",
    );
  });

  it("does not offer to request a seat on the driver's own trip", async () => {
    getOfferDetail.mockResolvedValue({ ...DETAIL, isOwn: true });
    render(<TripDetailPage />);

    await screen.findByText("Mateo Q.");

    expect(screen.queryByRole("button", { name: "Solicitar asiento" })).toBeNull();
    expect(screen.queryByLabelText("Mensaje para el conductor (opcional)")).toBeNull();
  });

  it("shows the sent state instead of the form when the request is already pending", async () => {
    getOfferDetail.mockResolvedValue({ ...DETAIL, booking: { id: "b-1", status: "pending" } });
    render(<TripDetailPage />);

    expect(
      await screen.findByText("Solicitud enviada. Te avisaremos cuando Mateo Q. responda."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Solicitar asiento" })).toBeNull();
  });

  it("announces the sent confirmation in a status region and shows progress while sending", async () => {
    let finish: (value: unknown) => void = () => {};
    requestSeat.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<TripDetailPage />);

    await user.click(await screen.findByRole("button", { name: "Solicitar asiento" }));
    expect(screen.getByRole("button", { name: "Enviando…" })).toHaveProperty("disabled", true);

    finish({ booking: { id: "b-1", status: "pending" } });
    expect((await screen.findByRole("status")).textContent).toBe(
      "Solicitud enviada. Te avisaremos cuando Mateo Q. responda.",
    );
  });

  it("starts from scratch when the person moves to another trip", async () => {
    requestSeat.mockResolvedValue({ booking: { id: "b-1", status: "pending" } });
    const user = userEvent.setup();
    const { rerender } = render(<TripDetailPage />);
    await user.click(await screen.findByRole("button", { name: "Solicitar asiento" }));
    await screen.findByText(/Solicitud enviada/);

    currentId = OTHER_ID;
    getOfferDetail.mockResolvedValue({ ...DETAIL, offerId: OTHER_ID, driverName: "Ana R." });
    rerender(<TripDetailPage />);

    expect(await screen.findByText("Ana R.")).toBeTruthy();
    expect(screen.queryByText(/Solicitud enviada/)).toBeNull();
    expect(screen.getByRole("button", { name: "Solicitar asiento" })).toBeTruthy();
  });

  it("lets the passenger withdraw a pending request and ask again", async () => {
    getOfferDetail.mockResolvedValue({ ...DETAIL, booking: { id: "b-1", status: "pending" } });
    cancelBooking.mockResolvedValue({ booking: { id: "b-1", status: "cancelled_by_passenger" } });
    const user = userEvent.setup();
    render(<TripDetailPage />);

    await user.click(await screen.findByRole("button", { name: "Retirar solicitud" }));

    expect(await screen.findByText("Retiraste tu solicitud.")).toBeTruthy();
    expect(cancelBooking).toHaveBeenCalledWith("b-1");
    expect(screen.getByRole("button", { name: "Solicitar asiento" })).toBeTruthy();
    expect(screen.queryByText(/Solicitud enviada/)).toBeNull();
  });

  it("keeps the request and says why when it cannot be withdrawn", async () => {
    getOfferDetail.mockResolvedValue({ ...DETAIL, booking: { id: "b-1", status: "pending" } });
    cancelBooking.mockRejectedValue(serverError(409, "Esta solicitud ya no se puede retirar."));
    const user = userEvent.setup();
    render(<TripDetailPage />);

    await user.click(await screen.findByRole("button", { name: "Retirar solicitud" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Esta solicitud ya no se puede retirar.",
    );
    expect(screen.getByText(/Solicitud enviada/)).toBeTruthy();
  });

  it.each(["paused", "cancelled"] as const)(
    "does not offer a seat on a %s trip",
    async (status) => {
      getOfferDetail.mockResolvedValue({ ...DETAIL, status, match: null });
      render(<TripDetailPage />);

      expect(
        await screen.findByText("Este viaje cambió y ya no es compatible con tu búsqueda."),
      ).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Solicitar asiento" })).toBeNull();
    },
  );

  it("says the trip is full instead of offering a request when no seat is free", async () => {
    getOfferDetail.mockResolvedValue({ ...DETAIL, seatsFree: 0 });
    render(<TripDetailPage />);

    expect(await screen.findByText("Este viaje ya no tiene asientos libres.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Solicitar asiento" })).toBeNull();
  });

  it("confirms an accepted request instead of offering another one", async () => {
    getOfferDetail.mockResolvedValue({ ...DETAIL, booking: { id: "b-1", status: "accepted" } });
    render(<TripDetailPage />);

    expect(await screen.findByText("Mateo Q. aceptó tu solicitud.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Solicitar asiento" })).toBeNull();
  });

  it("announces that the trip is loading", async () => {
    getOfferDetail.mockReturnValue(new Promise(() => {}));
    render(<TripDetailPage />);

    expect(screen.getByRole("status").textContent).toBe("Cargando viaje…");
  });

  it.each([404, 422])("says the trip was not found when the server answers %i", async (status) => {
    getOfferDetail.mockRejectedValue(serverError(status, "Not Found"));
    render(<TripDetailPage />);

    expect((await screen.findByRole("alert")).textContent).toBe("No encontramos este viaje.");
  });

  it("never shows a raw error when the trip cannot be loaded", async () => {
    getOfferDetail.mockRejectedValue(serverError(500, "Internal Server Error"));
    render(<TripDetailPage />);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "No pudimos cargar este viaje. Inténtalo de nuevo.",
    );
  });

  it("sends the request only once when the button is tapped twice", async () => {
    requestSeat.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<TripDetailPage />);

    const button = await screen.findByRole("button", { name: "Solicitar asiento" });
    await user.dblClick(button);

    expect(requestSeat).toHaveBeenCalledTimes(1);
  });

  it("lists the safety signals the trip really has, without promising absolute safety", async () => {
    render(<TripDetailPage />);

    const safety = (await screen.findByRole("heading", { name: "Seguridad del viaje" }))
      .parentElement!;
    const items = within(safety)
      .getAllByRole("listitem")
      .map((item) => item.textContent);

    expect(items).toEqual([
      "Miembro verificado",
      "Vehículo registrado",
      "Info del vehículo disponible",
    ]);
    expect(document.body.textContent).not.toMatch(/garantiza|100% seguro|precio|cobro(?!:)/i);
  });

  it("highlights the person's own meeting point and pickup time", async () => {
    render(<TripDetailPage />);

    expect(await screen.findByText("Tu punto de encuentro")).toBeTruthy();
    expect(screen.getByText("Recogida: 7:29 a. m.")).toBeTruthy();
  });

  it("uses the singular when one seat is left", async () => {
    getOfferDetail.mockResolvedValue({ ...DETAIL, seatsFree: 1 });
    render(<TripDetailPage />);

    expect(await screen.findByText("1 asiento disponible")).toBeTruthy();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { listOfferBookings, acceptBooking, rejectBooking, noShowBooking } = vi.hoisted(() => ({
  listOfferBookings: vi.fn(),
  acceptBooking: vi.fn(),
  rejectBooking: vi.fn(),
  noShowBooking: vi.fn(),
}));

vi.mock("@/lib/communities-api", () => ({
  communitiesApi: { listOfferBookings, acceptBooking, rejectBooking, noShowBooking },
}));

import { serverError } from "@/test/server-error";

import BookingRequests from "./booking-requests";

const OFFER_ID = "22222222-2222-4222-8222-222222222222";
const BOOKING_ID = "33333333-3333-4333-8333-333333333333";
const BOOKINGS = {
  offerId: OFFER_ID,
  seatsTaken: 1,
  seatsTotal: 3,
  bookings: [
    {
      id: BOOKING_ID,
      passengerName: "Lucía R.",
      passengerPhotoUrl: "https://r2.example/lucia.jpg?signature=read",
      status: "pending" as const,
      meetingPointName: "Estación San Borja Sur (Línea 1)",
      pickupAt: "07:29",
      detourMinutes: 6,
      message: "Estaré en la estación.",
      avoidsCar: true,
      recommended: true,
    },
  ],
};

beforeEach(() => {
  listOfferBookings.mockReset().mockResolvedValue(BOOKINGS);
  acceptBooking.mockReset();
  rejectBooking.mockReset();
  noShowBooking.mockReset();
});

afterEach(cleanup);

describe("booking requests", () => {
  it("shows trip details and confirms when a passenger is accepted", async () => {
    const user = userEvent.setup();
    acceptBooking.mockResolvedValue({ booking: { id: BOOKING_ID, status: "accepted" } });
    render(<BookingRequests offerId={OFFER_ID} />);

    expect(await screen.findByText("Lucía R. · Miembro verificado")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Foto de Lucía R." })).toHaveAttribute(
      "src",
      "https://r2.example/lucia.jpg?signature=read",
    );
    expect(
      screen.getByText("Punto de encuentro: Estación San Borja Sur (Línea 1)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Recogida 07:29")).toBeInTheDocument();
    expect(screen.getByText("+6 min de desvío")).toBeInTheDocument();
    expect(screen.getByText("Evita un viaje en auto")).toBeInTheDocument();
    expect(screen.getByText("Recomendado")).toBeInTheDocument();
    expect(screen.getByText("Mensaje: Estaré en la estación.")).toBeInTheDocument();
    expect(screen.getByText("1 de 3 asientos ocupados")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Aceptar" }));

    expect(acceptBooking).toHaveBeenCalledWith(BOOKING_ID);
    expect(
      await screen.findByText("Pasajero aceptado. Ya pueden coordinar en el chat."),
    ).toBeInTheDocument();
  });

  it("removes a rejected request and confirms the decision", async () => {
    const user = userEvent.setup();
    rejectBooking.mockResolvedValue({ booking: { id: BOOKING_ID, status: "rejected" } });
    render(<BookingRequests offerId={OFFER_ID} />);

    await user.click(await screen.findByRole("button", { name: "Rechazar" }));

    expect(rejectBooking).toHaveBeenCalledWith(BOOKING_ID);
    expect(await screen.findByText("Solicitud rechazada.")).toBeInTheDocument();
    expect(screen.queryByText("Lucía R. · Miembro verificado")).not.toBeInTheDocument();
  });

  describe("No se presentó", () => {
    const accepted = (today: string) => ({
      ...BOOKINGS,
      bookings: [{ ...BOOKINGS.bookings[0], status: "accepted" as const, today }],
    });
    // Monday 2026-10-19 in Lima (UTC-5); the pickup is at 07:29.
    const limaNow = (limaTime: string) =>
      vi.useFakeTimers({ toFake: ["Date"], now: new Date(`2026-10-19T${limaTime}:00.000-05:00`) });
    afterEach(() => vi.useRealTimers());

    it("stays closed until 10 minutes after the pickup time and says why", async () => {
      limaNow("07:38");
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      listOfferBookings.mockResolvedValue(accepted("not_started"));
      render(<BookingRequests offerId={OFFER_ID} />);

      const button = await screen.findByRole("button", { name: "No se presentó" });
      await user.click(button);

      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(
        screen.getByText("Podrás marcarlo 10 minutos después de la hora de recogida."),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("¿Confirmas que esta persona no se presentó?"),
      ).not.toBeInTheDocument();
      expect(noShowBooking).not.toHaveBeenCalled();
    });
    it("asks for a confirmation first, then records the no-show and says so", async () => {
      limaNow("07:39");
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      listOfferBookings.mockResolvedValue(accepted("not_started"));
      noShowBooking.mockResolvedValue({
        booking: {
          id: BOOKING_ID,
          tripDate: "2026-10-19",
          startedAt: null,
          arrivedAt: null,
          outcome: "no_show",
        },
        message: "Registramos que la persona no se presentó.",
      });
      render(<BookingRequests offerId={OFFER_ID} />);

      await user.click(await screen.findByRole("button", { name: "No se presentó" }));
      expect(noShowBooking).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(screen.getByRole("button", { name: "No se presentó" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "No se presentó" }));
      await user.click(screen.getByRole("button", { name: "Sí, no se presentó" }));

      expect(noShowBooking).toHaveBeenCalledExactlyOnceWith(BOOKING_ID);
      expect(
        await screen.findByText("Registramos que la persona no se presentó."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "No se presentó" })).not.toBeInTheDocument();
    });

    it("shows the server's reason when it refuses", async () => {
      limaNow("07:39");
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      listOfferBookings.mockResolvedValue(accepted("not_started"));
      noShowBooking.mockRejectedValue(serverError(409, "Esta persona ya está en el viaje."));
      render(<BookingRequests offerId={OFFER_ID} />);

      await user.click(await screen.findByRole("button", { name: "No se presentó" }));
      await user.click(screen.getByRole("button", { name: "Sí, no se presentó" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Esta persona ya está en el viaje.",
      );
    });

    it.each([
      ["in_progress", "En el auto"],
      ["arrived", "Llegó bien"],
    ])("offers no no-show once the passenger is %s", async (today, label) => {
      limaNow("07:45");
      listOfferBookings.mockResolvedValue(accepted(today));
      render(<BookingRequests offerId={OFFER_ID} />);

      expect(await screen.findByText(label)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "No se presentó" })).not.toBeInTheDocument();
    });
  });

  it("displays 'Tu auto ya está lleno.' and disables acceptance when all seats are taken", async () => {
    listOfferBookings.mockResolvedValue({
      ...BOOKINGS,
      seatsTaken: 3,
      seatsTotal: 3,
    });
    render(<BookingRequests offerId={OFFER_ID} />);

    expect(await screen.findByText("Tu auto ya está lleno.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aceptar" })).toBeDisabled();
  });

  it("displays server error alert when accepting fails because car is full", async () => {
    const user = userEvent.setup();
    acceptBooking.mockRejectedValue(serverError(409, "Tu auto ya está lleno."));
    render(<BookingRequests offerId={OFFER_ID} />);

    await user.click(await screen.findByRole("button", { name: "Aceptar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Tu auto ya está lleno.");
  });

  it("renders passenger message as escaped text without HTML parsing", async () => {
    listOfferBookings.mockResolvedValue({
      ...BOOKINGS,
      bookings: [
        {
          ...BOOKINGS.bookings[0]!,
          message: '<script>alert("xss")</script><b>Puntual</b>',
        },
      ],
    });
    const { container } = render(<BookingRequests offerId={OFFER_ID} />);

    expect(
      await screen.findByText('Mensaje: <script>alert("xss")</script><b>Puntual</b>'),
    ).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });
});

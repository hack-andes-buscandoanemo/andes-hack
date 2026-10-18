import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { listOfferBookings, acceptBooking, rejectBooking } = vi.hoisted(() => ({
  listOfferBookings: vi.fn(),
  acceptBooking: vi.fn(),
  rejectBooking: vi.fn(),
}));

vi.mock("@/lib/communities-api", () => ({
  communitiesApi: { listOfferBookings, acceptBooking, rejectBooking },
}));

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
});

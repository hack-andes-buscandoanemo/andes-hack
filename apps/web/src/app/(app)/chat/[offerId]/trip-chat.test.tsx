import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { getTripMessages, sendTripMessage } = vi.hoisted(() => ({
  getTripMessages: vi.fn(),
  sendTripMessage: vi.fn(),
}));

vi.mock("@/lib/communities-api", () => ({
  communitiesApi: { getTripMessages, sendTripMessage },
}));

import TripChat from "./trip-chat";

const OFFER_ID = "22222222-2222-4222-8222-222222222222";
const EMPTY_CHAT = {
  conversation: {
    offerId: OFFER_ID,
    communityName: "Comunidad Alfa",
    origin: "La Molina",
    destination: "Centro Empresarial Real",
    departureTime: "07:00:00",
    date: null,
    daysOfWeek: [1, 2, 3],
    role: "passenger" as const,
    participants: [
      { name: "Mateo M.", role: "driver" as const, photoUrl: "https://r2.example/mateo.jpg" },
      { name: "Lucía R.", role: "passenger" as const, photoUrl: null },
    ],
    meetingPoints: [{ participantName: "Lucía R.", name: "Estación San Borja Sur" }],
  },
  messages: [],
};

beforeEach(() => {
  getTripMessages.mockReset().mockResolvedValue(EMPTY_CHAT);
  sendTripMessage.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("trip chat", () => {
  it("shows the accepted trip and sends a quick coordination message", async () => {
    const user = userEvent.setup();
    sendTripMessage.mockResolvedValue({
      message: {
        id: "44444444-4444-4444-8444-444444444444",
        senderName: "Lucía R.",
        senderPhotoUrl: null,
        senderRole: "passenger",
        kind: "quick",
        body: "Estoy en el punto de encuentro",
        createdAt: "2026-10-18T12:00:00.000Z",
      },
    });
    render(<TripChat offerId={OFFER_ID} />);

    expect(
      await screen.findByRole("heading", { name: "La Molina → Centro Empresarial Real" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Grupo recurrente")).toBeInTheDocument();
    expect(screen.getByText("Salida confirmada")).toBeInTheDocument();
    expect(screen.getByText("2 participantes")).toBeInTheDocument();
    expect(
      screen.getByText("Punto de encuentro acordado: Estación San Borja Sur"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Escribe un mensaje")).toHaveAttribute("maxlength", "500");

    await user.click(screen.getByRole("button", { name: "Estoy en el punto de encuentro" }));

    expect(sendTripMessage).toHaveBeenCalledWith(OFFER_ID, {
      kind: "quick",
      body: "Estoy en el punto de encuentro",
    });
    expect(await screen.findAllByText("Estoy en el punto de encuentro")).toHaveLength(2);
  });

  it("polls for new messages every seven seconds", async () => {
    vi.useFakeTimers();
    render(<TripChat offerId={OFFER_ID} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getTripMessages).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });

    expect(getTripMessages).toHaveBeenCalledTimes(2);
  });

  it("uses the last message id as the polling cursor", async () => {
    vi.useFakeTimers();
    const firstMessage = {
      id: "33333333-3333-4333-8333-333333333333",
      senderName: "Mateo M.",
      senderRole: "driver" as const,
      kind: "text" as const,
      body: "Nos vemos",
      createdAt: "2026-10-18T12:00:00.000Z",
    };
    getTripMessages.mockResolvedValueOnce({ ...EMPTY_CHAT, messages: [firstMessage] });
    render(<TripChat offerId={OFFER_ID} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });

    expect(getTripMessages).toHaveBeenLastCalledWith(OFFER_ID, firstMessage.id);
  });

  it("keeps a failed message available for retry", async () => {
    const user = userEvent.setup();
    sendTripMessage.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({
      message: {
        id: "44444444-4444-4444-8444-444444444444",
        senderName: "Lucía R.",
        senderRole: "passenger",
        kind: "text",
        body: "Voy llegando",
        createdAt: "2026-10-18T12:00:00.000Z",
      },
    });
    render(<TripChat offerId={OFFER_ID} />);

    await user.type(await screen.findByLabelText("Escribe un mensaje"), "Voy llegando");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText("No se pudo enviar.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(sendTripMessage).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Voy llegando")).toBeInTheDocument();
  });
});

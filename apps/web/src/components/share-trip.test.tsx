import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SERVER_URL = "http://localhost:3000";
});

import { serverError } from "@/test/server-error";
import { httpClient } from "@/lib/http-client";

import ShareTrip from "./share-trip";

const BOOKING_ID = "44444444-4444-4444-8444-444444444444";
const LINK_ID = "55555555-5555-4555-8555-555555555555";
const TOKEN = "k3Jd9sLq2Vx8Zt1Mw0RbYhNc7UeGoPaFiXvD4TyQ6Es";

const serverAnswer = vi.fn();
const originalAdapter = httpClient.defaults.adapter;

beforeEach(() => {
  serverAnswer.mockReset().mockImplementation(async (method: string, url: string) => {
    if (method === "post" && url === `/bookings/${BOOKING_ID}/share-links`) {
      return { id: LINK_ID, token: TOKEN, expiresAt: "2026-10-20T05:00:00.000Z" };
    }
    if (method === "delete" && url === `/share-links/${LINK_ID}`) {
      return { id: LINK_ID, revokedAt: "2026-10-19T15:00:00.000Z" };
    }
    throw new Error(`unexpected ${method} ${url}`);
  });
  httpClient.defaults.adapter = async (config) => {
    const data = await serverAnswer(config.method, config.url);
    return { data, status: 200, statusText: "OK", headers: {}, config };
  };
});

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
  vi.unstubAllGlobals();
});

describe("ShareTrip", () => {
  it("creates the link and shows it with the moment it stops working", async () => {
    render(<ShareTrip bookingId={BOOKING_ID} label="Compartir viaje" />);

    await userEvent.click(screen.getByRole("button", { name: "Compartir viaje" }));

    expect(await screen.findByLabelText("Enlace para compartir")).toHaveValue(
      `${window.location.origin}/compartido/${TOKEN}`,
    );
    expect(screen.getByText("El enlace vence al final del día del viaje.")).toBeInTheDocument();
  });

  it("copies the link to the clipboard", async () => {
    const user = userEvent.setup();
    render(<ShareTrip bookingId={BOOKING_ID} label="Compartir viaje" />);
    await user.click(screen.getByRole("button", { name: "Compartir viaje" }));
    await screen.findByLabelText("Enlace para compartir");

    await user.click(screen.getByRole("button", { name: "Copiar enlace" }));

    expect(await screen.findByText("Enlace copiado.")).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}/compartido/${TOKEN}`,
    );
  });

  it("offers the system share sheet only where the browser has one", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ShareTrip bookingId={BOOKING_ID} label="Compartir viaje" />);
    await user.click(screen.getByRole("button", { name: "Compartir viaje" }));
    await screen.findByLabelText("Enlace para compartir");
    expect(screen.queryByRole("button", { name: "Enviar enlace" })).not.toBeInTheDocument();
    unmount();

    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { share }));
    render(<ShareTrip bookingId={BOOKING_ID} label="Compartir viaje" />);
    await user.click(screen.getByRole("button", { name: "Compartir viaje" }));
    await user.click(await screen.findByRole("button", { name: "Enviar enlace" }));

    expect(share).toHaveBeenCalledWith({
      title: "Mi viaje en Te Jalo",
      text: "Sigue mi viaje:",
      url: `${window.location.origin}/compartido/${TOKEN}`,
    });
  });

  it("stops sharing and goes back to offering the link", async () => {
    const user = userEvent.setup();
    render(<ShareTrip bookingId={BOOKING_ID} label="Compartir viaje" />);
    await user.click(screen.getByRole("button", { name: "Compartir viaje" }));
    await screen.findByLabelText("Enlace para compartir");

    await user.click(screen.getByRole("button", { name: "Dejar de compartir" }));

    expect(await screen.findByText("Dejaste de compartir este viaje.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Enlace para compartir")).not.toBeInTheDocument();
    expect(serverAnswer).toHaveBeenLastCalledWith("delete", `/share-links/${LINK_ID}`);
    expect(screen.getByRole("button", { name: "Compartir viaje" })).toBeInTheDocument();
  });

  it("says so when the link could not be created", async () => {
    serverAnswer.mockRejectedValue(
      serverError(409, "Solo puedes compartir un viaje con asiento confirmado."),
    );
    render(<ShareTrip bookingId={BOOKING_ID} label="Compartir viaje" />);

    await userEvent.click(screen.getByRole("button", { name: "Compartir viaje" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Solo puedes compartir un viaje con asiento confirmado.",
    );
    expect(screen.getByRole("button", { name: "Compartir viaje" })).toBeEnabled();
  });
});

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SERVER_URL = "http://localhost:3000";
});

const TOKEN = "k3Jd9sLq2Vx8Zt1Mw0RbYhNc7UeGoPaFiXvD4TyQ6Es";

vi.mock("next/navigation", () => ({ useParams: () => ({ token: TOKEN }) }));

import { httpClient } from "@/lib/http-client";
import { serverError } from "@/test/server-error";

import SharedTripPage from "./page";

const serverAnswer = vi.fn();
const originalAdapter = httpClient.defaults.adapter;

const SHARED = {
  passengerAlias: "Mari T.",
  driverAlias: "Carlos Q.",
  vehicle: { make: "Toyota", model: "Corolla", color: "Gris", plate: "ABC123" },
  meetingPointName: "Estación San Borja Sur (Línea 1)",
  estimatedTime: "07:29",
  status: "not_started" as const,
};

beforeEach(() => {
  serverAnswer.mockReset().mockResolvedValue(SHARED);
  httpClient.defaults.adapter = async (config) => {
    const data = await serverAnswer(config.url);
    return { data, status: 200, statusText: "OK", headers: {}, config };
  };
});

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
});

describe("shared trip /compartido/{token}", () => {
  it("shows who travels, the car with plate, the meeting point, the time and the status", async () => {
    render(<SharedTripPage />);

    expect(await screen.findByText("Mari T. comparte su viaje contigo")).toBeInTheDocument();
    expect(serverAnswer).toHaveBeenCalledWith(`/public/share/${TOKEN}`);
    expect(screen.getByText("Conductor: Carlos Q.")).toBeInTheDocument();
    expect(screen.getByText("Vehículo: Toyota Corolla gris")).toBeInTheDocument();
    expect(screen.getByText("Placa: ABC123")).toBeInTheDocument();
    expect(
      screen.getByText("Punto de encuentro: Estación San Borja Sur (Línea 1)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Hora estimada: 7:29 a. m.")).toBeInTheDocument();
    expect(screen.getByText("Por iniciar")).toBeInTheDocument();
  });

  it("reads En curso and Llegó bien as the trip moves on", async () => {
    serverAnswer.mockResolvedValue({ ...SHARED, status: "in_progress" });
    const first = render(<SharedTripPage />);
    expect(await screen.findByText("En curso")).toBeInTheDocument();
    first.unmount();

    serverAnswer.mockResolvedValue({ ...SHARED, status: "arrived" });
    render(<SharedTripPage />);
    expect(await screen.findByText("Llegó bien")).toBeInTheDocument();
  });

  it("says the link is no longer available when it expired or was revoked", async () => {
    serverAnswer.mockRejectedValue(serverError(404, "Este enlace ya no está disponible."));
    render(<SharedTripPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este enlace ya no está disponible.",
    );
    expect(screen.queryByText("Placa: ABC123")).not.toBeInTheDocument();
  });

  it("says to wait a moment when too many attempts were made (429)", async () => {
    serverAnswer.mockRejectedValue(
      serverError(429, "Demasiadas consultas. Inténtalo en un momento."),
    );
    render(<SharedTripPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Demasiados intentos. Inténtalo en un momento.",
    );
  });

  it("asks to try again when the server fails", async () => {
    serverAnswer.mockRejectedValue(serverError(500, "boom"));
    render(<SharedTripPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos cargar este viaje. Inténtalo de nuevo.",
    );
  });
});

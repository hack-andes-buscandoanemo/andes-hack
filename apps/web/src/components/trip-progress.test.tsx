import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SERVER_URL = "http://localhost:3000";
});

import { serverError } from "@/test/server-error";
import { httpClient } from "@/lib/http-client";
import type { MyTrip } from "@/lib/communities-api";

import TripProgress from "./trip-progress";

const OFFER_ID = "22222222-2222-4222-8222-222222222222";
const BOOKING_ID = "44444444-4444-4444-8444-444444444444";

const PASSENGER_TRIP = {
  id: BOOKING_ID,
  offerId: OFFER_ID,
  role: "passenger",
  status: "accepted",
  progress: "not_started",
} as MyTrip;

const serverAnswer = vi.fn();
const originalAdapter = httpClient.defaults.adapter;

beforeEach(() => {
  serverAnswer.mockReset();
  httpClient.defaults.adapter = async (config) => {
    const data = await serverAnswer(config.method, config.url);
    return { data, status: 200, statusText: "OK", headers: {}, config };
  };
});

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
});

const aboard = {
  booking: {
    id: BOOKING_ID,
    status: "accepted",
    startedAt: "2026-10-19T11:45:00.000Z",
    arrivedAt: null,
  },
  message: "Viaje en curso.",
};

describe("TripProgress for the passenger", () => {
  it("says the trip is under way once they are in the car, and only then offers the arrival", async () => {
    serverAnswer.mockImplementation(async (method: string, url: string) => {
      if (method === "post" && url === `/bookings/${BOOKING_ID}/board`) return aboard;
      throw new Error(`unexpected ${method} ${url}`);
    });
    render(<TripProgress trip={PASSENGER_TRIP} />);
    expect(screen.getByRole("button", { name: "Llegué bien" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Ya estoy en el auto" }));

    expect(await screen.findByText("Viaje en curso")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Llegué bien" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Ya estoy en el auto" })).not.toBeInTheDocument();
  });
});

describe("TripProgress arrival", () => {
  it("thanks the passenger and leaves no more buttons once the server confirms the arrival", async () => {
    serverAnswer.mockImplementation(async (method: string, url: string) => {
      if (method === "post" && url === `/bookings/${BOOKING_ID}/arrive`) {
        return {
          booking: {
            id: BOOKING_ID,
            status: "completed",
            startedAt: "2026-10-19T11:45:00.000Z",
            arrivedAt: "2026-10-19T12:55:00.000Z",
          },
          message: "Llegada confirmada. ¡Gracias por compartir el viaje!",
        };
      }
      throw new Error(`unexpected ${method} ${url}`);
    });
    render(<TripProgress trip={{ ...PASSENGER_TRIP, progress: "in_progress" }} />);

    await userEvent.click(screen.getByRole("button", { name: "Llegué bien" }));

    expect(
      await screen.findByText("Llegada confirmada. ¡Gracias por compartir el viaje!"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("TripProgress refusals", () => {
  it("shows the server's reason, as an alert, and keeps the buttons", async () => {
    serverAnswer.mockImplementation(async () => {
      throw serverError(409, "Podrás iniciar el viaje 30 minutos antes de la salida.");
    });
    render(<TripProgress trip={PASSENGER_TRIP} />);

    await userEvent.click(screen.getByRole("button", { name: "Ya estoy en el auto" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Podrás iniciar el viaje 30 minutos antes de la salida.",
    );
    expect(screen.getByRole("button", { name: "Ya estoy en el auto" })).toBeEnabled();
    expect(screen.queryByText("Viaje en curso")).not.toBeInTheDocument();
  });
});

describe("TripProgress for the driver", () => {
  const DRIVER_TRIP = {
    id: OFFER_ID,
    offerId: OFFER_ID,
    role: "driver",
    status: "active",
    progress: null,
  } as MyTrip;

  it("starts the trip for everyone aboard and then only says it is under way", async () => {
    serverAnswer.mockImplementation(async (method: string, url: string) => {
      if (method === "post" && url === `/offers/${OFFER_ID}/start`) {
        return { startedAt: "2026-10-19T11:30:00.000Z", boarded: 2, message: "Viaje en curso." };
      }
      throw new Error(`unexpected ${method} ${url}`);
    });
    render(<TripProgress trip={DRIVER_TRIP} />);
    expect(screen.queryByRole("button", { name: "Llegué bien" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Iniciar viaje" }));

    expect(await screen.findByText("Viaje en curso")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

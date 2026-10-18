import { render, screen, waitFor } from "@testing-library/react";
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
    tripDate: "2026-10-19",
    startedAt: "2026-10-19T11:45:00.000Z",
    arrivedAt: null,
    outcome: null,
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
    expect(screen.getByRole("button", { name: "Llegué bien" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await userEvent.click(screen.getByRole("button", { name: "Ya estoy en el auto" }));

    expect(await screen.findByText("Viaje en curso")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Llegué bien" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    expect(screen.queryByRole("button", { name: "Ya estoy en el auto" })).not.toBeInTheDocument();
  });
});

describe("TripProgress before the trip starts", () => {
  it("explains why the arrival is not available yet instead of failing silently", async () => {
    render(<TripProgress trip={PASSENGER_TRIP} />);

    const arrive = screen.getByRole("button", { name: "Llegué bien" });
    await userEvent.click(arrive);

    expect(arrive).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Disponible cuando el viaje haya iniciado.")).toBeInTheDocument();
    expect(serverAnswer).not.toHaveBeenCalled();
  });

  it("sends a double tap once", async () => {
    serverAnswer.mockImplementation(async () => aboard);
    render(<TripProgress trip={PASSENGER_TRIP} />);
    const button = screen.getByRole("button", { name: "Ya estoy en el auto" });

    await userEvent.dblClick(button);

    expect(serverAnswer).toHaveBeenCalledTimes(1);
  });

  it("does not claim the trip is under way when the answer carries no start", async () => {
    serverAnswer.mockImplementation(async () => ({
      ...aboard,
      booking: { ...aboard.booking, startedAt: null },
    }));
    render(<TripProgress trip={PASSENGER_TRIP} />);

    await userEvent.click(screen.getByRole("button", { name: "Ya estoy en el auto" }));

    await waitFor(() => expect(serverAnswer).toHaveBeenCalled());
    expect(screen.queryByText("Viaje en curso")).not.toBeInTheDocument();
  });

  it("remembers an arrival the server already recorded", () => {
    render(<TripProgress trip={{ ...PASSENGER_TRIP, progress: "arrived" }} />);

    expect(
      screen.getByText("Llegada confirmada. ¡Gracias por compartir el viaje!"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("TripProgress arrival", () => {
  it("thanks the passenger and leaves no more buttons once the server confirms the arrival", async () => {
    serverAnswer.mockImplementation(async (method: string, url: string) => {
      if (method === "post" && url === `/bookings/${BOOKING_ID}/arrive`) {
        return {
          booking: {
            id: BOOKING_ID,
            tripDate: "2026-10-19",
            startedAt: "2026-10-19T11:45:00.000Z",
            arrivedAt: "2026-10-19T12:55:00.000Z",
            outcome: "completed",
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
  beforeEach(() =>
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T06:30:00-05:00") }),
  );
  afterEach(() => vi.useRealTimers());
  const DRIVER_TRIP = {
    id: OFFER_ID,
    offerId: OFFER_ID,
    role: "driver",
    status: "active",
    progress: null,
    date: "2026-10-19",
    time: "07:00:00",
  } as MyTrip;

  it("keeps start closed before the 30-minute window and explains why", async () => {
    vi.setSystemTime(new Date("2026-10-19T06:29:59-05:00"));
    render(<TripProgress trip={DRIVER_TRIP} />);

    const start = screen.getByRole("button", { name: "Iniciar viaje" });
    await userEvent.click(start);

    expect(start).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText("Podrás iniciar el viaje 30 minutos antes de la salida."),
    ).toBeInTheDocument();
    expect(serverAnswer).not.toHaveBeenCalled();
  });

  it("starts the trip for everyone aboard and then only says it is under way", async () => {
    serverAnswer.mockImplementation(async (method: string, url: string) => {
      if (method === "post" && url === `/offers/${OFFER_ID}/start`) {
        return {
          tripDate: "2026-10-19",
          startedAt: "2026-10-19T11:30:00.000Z",
          boarded: 2,
          message: "Viaje en curso.",
        };
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

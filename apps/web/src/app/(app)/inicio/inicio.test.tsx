import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MyTrip } from "@/lib/communities-api";
import { httpClient } from "@/lib/http-client";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import Inicio from "./inicio";

const originalAdapter = httpClient.defaults.adapter;
let trips: MyTrip[];

const OUTBOUND: MyTrip = {
  id: "outward-booking",
  offerId: "outward-offer",
  role: "passenger",
  status: "accepted",
  direction: "outbound",
  date: null,
  daysOfWeek: [1, 3],
  time: "07:00:00",
  originZoneName: "La Molina",
  destinationName: "Centro Empresarial Real",
  meetingPointName: "Estación La Cultura",
  driver: { alias: "Carlos Q.", plate: "ABC123" },
  seatsTotal: null,
  seatsFree: null,
  pendingRequests: null,
  acceptedPassengers: null,
  passengerRequest: {
    communityId: "33333333-3333-4333-8333-333333333333",
    originZoneId: "la-molina",
    date: null,
    daysOfWeek: [1, 3],
    fallbackMode: "public_transport",
    returnWindow: { start: "18:00", end: "18:30" },
  },
};

beforeEach(() => {
  trips = [];
  push.mockReset();
  httpClient.defaults.adapter = async (config) => {
    if (
      config.url !== "/me/trips" ||
      config.params.role !== "passenger" ||
      config.params.scope !== "upcoming"
    ) {
      throw new Error(`Unexpected request: ${config.url}`);
    }
    return { data: { trips }, status: 200, statusText: "OK", headers: {}, config };
  };
});

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
});

describe("inicio", () => {
  it("shows the accepted outward trip and coordinates its return from the member's real trips", async () => {
    trips = [
      {
        ...OUTBOUND,
        id: "return-booking",
        offerId: "return-offer",
        direction: "return",
        time: "18:10:00",
        daysOfWeek: [3, 4],
        passengerRequest: { ...OUTBOUND.passengerRequest!, daysOfWeek: [3, 5] },
      },
      OUTBOUND,
    ];
    render(<Inicio name="Ana" />);

    const upcoming = await screen.findByRole("region", { name: "Tus próximos viajes" });
    const outward = within(upcoming).getByRole("article", {
      name: "Ida · La Molina → Centro Empresarial Real",
    });
    expect(within(outward).getByText("Carlos Q.")).toBeInTheDocument();
    expect(within(outward).getByRole("link", { name: "Ver viaje" })).toHaveAttribute(
      "href",
      "/viajes/outward-offer",
    );
    const coordination = within(outward).getByRole("region", { name: "¿Y el regreso?" });
    const pair = within(coordination).getByRole("region", { name: "Ida y regreso: Miércoles" });
    expect(within(pair).getByRole("link", { name: "Regreso · 6:10 p. m." })).toHaveAttribute(
      "href",
      "/viajes/return-offer",
    );
    await userEvent.click(within(coordination).getByRole("button", { name: "Buscar regreso" }));
    expect(push).toHaveBeenCalledWith(
      "/buscar?direction=return&communityId=33333333-3333-4333-8333-333333333333&originZoneId=la-molina&windowStart=18%3A00&windowEnd=18%3A30&fallbackMode=public_transport&daysOfWeek=1%2C3",
    );
    expect(
      screen.queryByText("Aún no tienes viajes. Busca uno o publica el que ya haces."),
    ).not.toBeInTheDocument();
  });

  it("greets the member and asks where they are going", () => {
    render(<Inicio name="Ana" />);

    expect(screen.getByRole("heading", { level: 1, name: "Hola, Ana 👋" })).toBeInTheDocument();
    expect(screen.getByText("¿A dónde vamos hoy?")).toBeInTheDocument();
  });

  it("shows the community chip only when the community is known", () => {
    const { rerender } = render(<Inicio name="Ana" communityName="Universidad Nacional" />);
    expect(screen.getByText("Universidad Nacional")).toBeInTheDocument();
    expect(screen.getByText("Miembro verificado")).toBeInTheDocument();

    rerender(<Inicio name="Ana" />);
    expect(screen.queryByText("Miembro verificado")).not.toBeInTheDocument();
  });

  it("links the two main actions", () => {
    render(<Inicio name="Ana" />);

    expect(screen.getByRole("link", { name: "Buscar viaje" })).toHaveAttribute("href", "/buscar");
    expect(screen.getByRole("link", { name: "Ofrecer viaje" })).toHaveAttribute("href", "/ofrecer");
  });

  it("explains the empty states instead of inventing data", async () => {
    render(<Inicio name="Ana" />);

    expect(
      await screen.findByText("Aún no tienes viajes. Busca uno o publica el que ya haces."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Tu próximo viaje")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Coincidencias de hoy" })).toBeInTheDocument();
    expect(screen.getByText("Aún no hay coincidencias para hoy.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver todas" })).toHaveAttribute("href", "/buscar");
    expect(screen.getByRole("heading", { name: "Tu impacto" })).toBeInTheDocument();
    expect(
      screen.getByText("Tu impacto aparecerá cuando completes tu primer viaje compartido."),
    ).toBeInTheDocument();
  });
});

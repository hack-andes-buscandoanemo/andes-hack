import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MyTrip } from "@/lib/communities-api";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import ReturnTripCard, { commonCalendar } from "./return-trip-card";

const TRIP: MyTrip = {
  id: "11111111-1111-4111-8111-111111111111",
  offerId: "22222222-2222-4222-8222-222222222222",
  role: "passenger",
  status: "accepted",
  direction: "outbound",
  date: null,
  daysOfWeek: [1, 2, 3, 4, 5],
  time: "07:00",
  originZoneName: "La Molina",
  destinationName: "Centro Empresarial Real",
  meetingPointName: null,
  driver: null,
  seatsTotal: null,
  seatsFree: null,
  pendingRequests: null,
  acceptedPassengers: null,
  passengerRequest: {
    communityId: "33333333-3333-4333-8333-333333333333",
    originZoneId: "san-borja",
    date: null,
    daysOfWeek: [1, 3],
    fallbackMode: "public_transport",
    returnWindow: { start: "18:00", end: "18:30" },
  },
};

beforeEach(() => push.mockReset());

describe("return coordination card", () => {
  it("requires a recurring offer to serve the passenger's one-off date", () => {
    render(
      <ReturnTripCard
        trip={{
          ...TRIP,
          daysOfWeek: [2, 4],
          passengerRequest: { ...TRIP.passengerRequest!, date: "2099-03-02", daysOfWeek: null },
        }}
      />,
    );
    expect(screen.queryByRole("region", { name: "¿Y el regreso?" })).not.toBeInTheDocument();
  });
  it("rejects different one-off dates even when both are accepted", () => {
    render(
      <ReturnTripCard
        trip={{
          ...TRIP,
          date: "2099-03-02",
          daysOfWeek: null,
          passengerRequest: { ...TRIP.passengerRequest!, date: "2099-03-04", daysOfWeek: null },
        }}
      />,
    );
    expect(screen.queryByRole("region", { name: "¿Y el regreso?" })).not.toBeInTheDocument();
  });
  it("does not coordinate a one-off offer outside the passenger's recurring days", () => {
    render(<ReturnTripCard trip={{ ...TRIP, date: "2099-03-03", daysOfWeek: null }} />);
    expect(screen.queryByRole("region", { name: "¿Y el regreso?" })).not.toBeInTheDocument();
  });
  it("does not invent accepted service when the passenger and offer calendars do not overlap", () => {
    render(<ReturnTripCard trip={{ ...TRIP, daysOfWeek: [2, 4] }} />);
    expect(screen.queryByRole("region", { name: "¿Y el regreso?" })).not.toBeInTheDocument();
  });
  it("only offers coordination for an accepted outward passenger trip", () => {
    const { rerender } = render(<ReturnTripCard trip={{ ...TRIP, status: "pending" }} />);
    expect(screen.queryByRole("region", { name: "¿Y el regreso?" })).not.toBeInTheDocument();
    rerender(<ReturnTripCard trip={{ ...TRIP, role: "driver" }} />);
    expect(screen.queryByRole("region", { name: "¿Y el regreso?" })).not.toBeInTheDocument();
    rerender(<ReturnTripCard trip={{ ...TRIP, direction: "return" }} />);
    expect(screen.queryByRole("region", { name: "¿Y el regreso?" })).not.toBeInTheDocument();
  });
  it("requires an ordered editable departure window without inventing a time", async () => {
    render(
      <ReturnTripCard
        trip={{ ...TRIP, passengerRequest: { ...TRIP.passengerRequest!, returnWindow: null } }}
      />,
    );
    expect(screen.getByLabelText("Desde")).toHaveValue("");
    expect(screen.getByLabelText("Hasta")).toHaveValue("");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Desde"), "18:30");
    await user.type(screen.getByLabelText("Hasta"), "18:00");
    await user.click(screen.getByRole("button", { name: "Buscar regreso" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Elige una ventana de salida válida.");
    expect(push).not.toHaveBeenCalled();
  });
  it("prefills the passenger's window and accepted days then opens return search", async () => {
    render(<ReturnTripCard trip={TRIP} />);
    expect(screen.getByRole("region", { name: "¿Y el regreso?" })).toBeInTheDocument();
    expect(screen.getByText("Salir de Centro Empresarial Real entre")).toBeInTheDocument();
    expect(screen.getByText("Lunes y miércoles")).toBeInTheDocument();
    expect(screen.getByLabelText("Desde")).toHaveValue("18:00");
    expect(screen.getByLabelText("Hasta")).toHaveValue("18:30");
    await userEvent.click(screen.getByRole("button", { name: "Buscar regreso" }));
    const params = new URL(push.mock.calls[0]![0], "http://localhost").searchParams;
    expect(params.get("direction")).toBe("return");
    expect(params.get("originZoneId")).toBe("san-borja");
    expect(params.get("communityId")).toBe("33333333-3333-4333-8333-333333333333");
    expect(params.get("daysOfWeek")).toBe("1,3");
    expect(params.get("windowStart")).toBe("18:00");
    expect(params.get("windowEnd")).toBe("18:30");
    expect(params.get("fallbackMode")).toBe("public_transport");
  });
});

describe("commonCalendar", () => {
  it("keeps the weekdays every calendar shares", () => {
    expect(
      commonCalendar({ date: null, daysOfWeek: [1, 2, 3] }, { date: null, daysOfWeek: [2, 3, 4] }),
    ).toEqual({ date: null, days: [2, 3] });
  });

  it("accepts a one-off date that falls on a shared weekday", () => {
    expect(
      commonCalendar({ date: "2026-10-19", daysOfWeek: null }, { date: null, daysOfWeek: [1] }),
    ).toEqual({ date: "2026-10-19", days: [] });
  });

  it("rejects a date outside the weekdays or a different date", () => {
    expect(
      commonCalendar({ date: "2026-10-19", daysOfWeek: null }, { date: null, daysOfWeek: [2] }),
    ).toBeNull();
    expect(
      commonCalendar(
        { date: "2026-10-19", daysOfWeek: null },
        { date: "2026-10-20", daysOfWeek: null },
      ),
    ).toBeNull();
  });
});

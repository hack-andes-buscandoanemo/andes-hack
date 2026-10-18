import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, type AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runMatching = vi.fn();
const latestMatchRuns = vi.fn();

vi.mock("@/lib/communities-api", () => ({
  communitiesApi: {
    runMatching: (...args: unknown[]) => runMatching(...args),
    latestMatchRuns: (...args: unknown[]) => latestMatchRuns(...args),
  },
}));

import Emparejamiento from "./emparejamiento";

const COMMUNITY_ID = "11111111-1111-4111-8111-111111111111";

const RUN = {
  id: "r-1",
  carTripsAvoided: 1,
  passengersMatched: 1,
  detourMinutes: 6,
  walkMinutes: 14,
  unassigned: 0,
  offers: 1,
  requests: 1,
  durationMs: 12,
  createdAt: "2026-10-18T15:00:00.000Z",
};

const RESULT = {
  direction: "outbound" as const,
  date: "2026-10-19",
  optimizer: { ...RUN, id: "r-opt" },
  firstComeFirstServed: { ...RUN, id: "r-fcfs", detourMinutes: 9 },
  suggestions: [
    {
      id: "s-1",
      offerId: "o-1",
      driverName: "Mateo Q.",
      requestId: "n-1",
      passengerName: "Lucía",
      meetingPointName: "Estación San Borja Sur (Línea 1)",
      pickupAt: "07:29",
      arrivalAt: "07:44",
      detourMinutes: 6,
      walkMinutes: 14,
      avoidsCarTrip: true,
      status: "proposed" as const,
    },
  ],
};

function serverError(status: number, error: string) {
  const response = { status, data: { success: false, status, error } } as AxiosResponse;
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, null, response);
}

beforeEach(() => {
  runMatching.mockReset();
  latestMatchRuns
    .mockReset()
    .mockRejectedValue(serverError(404, "Todavía no se ejecutó ningún emparejamiento."));
});

describe("Emparejamiento (US-019)", () => {
  it("runs the journey's matching and shows both strategies with the recommended seats", async () => {
    let finish: (value: typeof RESULT) => void = () => {};
    runMatching.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<Emparejamiento communityId={COMMUNITY_ID} />);

    await user.selectOptions(screen.getByLabelText("Dirección"), "Ida");
    await user.clear(screen.getByLabelText("Fecha"));
    await user.type(screen.getByLabelText("Fecha"), "2026-10-19");
    await user.click(screen.getByRole("button", { name: "Ejecutar emparejamiento" }));

    expect(screen.getByRole("status")).toHaveTextContent("Calculando emparejamiento…");
    expect(runMatching).toHaveBeenCalledWith(COMMUNITY_ID, {
      direction: "outbound",
      date: "2026-10-19",
    });
    finish(RESULT);

    expect(
      await screen.findByText(
        "Optimizador: 1 viajes en auto evitados · 1 pasajeros · 6 min de desvío total",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Primero en llegar: 1 viajes en auto evitados · 1 pasajeros · 9 min de desvío total",
      ),
    ).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Asignaciones recomendadas" });
    const [item] = within(list).getAllByRole("listitem");
    expect(item).toHaveTextContent("Lucía → viaje de Mateo Q.");
    expect(item).toHaveTextContent("Estación San Borja Sur (Línea 1)");
    expect(item).toHaveTextContent("Recogida 7:29 a. m. · Llegada 7:44 a. m.");
    expect(item).toHaveTextContent("Desvío 6 min · Caminata 14 min");
    expect(item).toHaveTextContent("Evita un viaje en auto");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("tells the admin when another run is in progress, and when the journey is empty", async () => {
    runMatching.mockRejectedValueOnce(
      serverError(409, "Ya hay un emparejamiento en curso para esta jornada."),
    );
    runMatching.mockRejectedValueOnce(
      serverError(409, "No hay ofertas ni necesidades para esta jornada."),
    );
    const user = userEvent.setup();
    render(<Emparejamiento communityId={COMMUNITY_ID} />);

    await user.click(screen.getByRole("button", { name: "Ejecutar emparejamiento" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ya hay un emparejamiento en curso para esta jornada.",
    );

    await user.click(screen.getByRole("button", { name: "Ejecutar emparejamiento" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No hay ofertas ni necesidades para esta jornada.",
    );
    expect(screen.queryByText(/Optimizador:/)).not.toBeInTheDocument();
  });

  it("shows the last journey run as soon as the admin opens the screen", async () => {
    latestMatchRuns.mockResolvedValue({ ...RESULT, direction: "return", suggestions: [] });
    render(<Emparejamiento communityId={COMMUNITY_ID} />);

    expect(
      await screen.findByRole("heading", { name: "Regreso · Lunes 19 de octubre" }),
    ).toBeInTheDocument();
    expect(latestMatchRuns).toHaveBeenCalledWith(COMMUNITY_ID);
    expect(
      screen.getByText("Ningún pasajero cabe en las ofertas de esta jornada."),
    ).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getMe = vi.fn();
const listCommunityZones = vi.fn();
const searchTrips = vi.fn();

vi.mock("@/lib/communities-api", () => ({
  communitiesApi: {
    getMe: (...args: unknown[]) => getMe(...args),
    listCommunityZones: (...args: unknown[]) => listCommunityZones(...args),
    searchTrips: (...args: unknown[]) => searchTrips(...args),
  },
}));

import BuscarPage from "./page";

const COMMUNITY_ID = "11111111-1111-4111-8111-111111111111";

const membership = (overrides: Record<string, unknown> = {}) => ({
  id: "m-1",
  communityId: COMMUNITY_ID,
  communityName: "Comunidad Alfa",
  destinationName: "Centro Empresarial Real",
  role: "member" as const,
  verificationMethod: "join_code" as const,
  consentVersion: "v1",
  consentAt: "2026-10-18T10:00:00.000Z",
  usualMode: "taxi_app" as const,
  travelRole: "passenger" as const,
  alias: "Lucía",
  identifiesAsWoman: false,
  womenOnly: false,
  isTeam: false,
  ...overrides,
});

const ME = {
  user: { id: "u-lucia", name: "Lucía", email: "lucia@alfa.pe" },
  memberships: [membership()],
};

const ZONES = [
  { id: "san-borja", name: "San Borja", district: "San Borja", lat: -12.0897, lng: -77.0031 },
  { id: "la-molina", name: "La Molina", district: "La Molina", lat: -12.0853, lng: -76.9682 },
];

const MATCH = {
  offerId: "22222222-2222-4222-8222-222222222222",
  driverName: "Mateo Q.",
  originZoneName: "La Molina",
  destinationName: "Centro Empresarial Real",
  direction: "outbound" as const,
  departureTime: "07:00:00",
  seatsFree: 3,
  meetingPointName: "Estación San Borja Sur (Línea 1)",
  pickupAt: "07:29",
  arrivalAt: "07:44",
  detourMinutes: 6,
  walkMinutes: 14,
  fuelEstimate: { tripSoles: 10.04, perOccupantSoles: 5.02, occupants: 2 },
};

beforeEach(() => {
  getMe.mockReset().mockResolvedValue(ME);
  listCommunityZones.mockReset().mockResolvedValue(ZONES);
  searchTrips.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// Zones arrive after the page shows, so wait for the option before picking it.
async function pickSanBorja(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("option", { name: "San Borja" });
  await user.selectOptions(screen.getByLabelText("Mi zona"), "san-borja");
}

async function searchFromSanBorja() {
  const user = userEvent.setup();
  render(<BuscarPage />);
  await pickSanBorja(user);
  await user.click(screen.getByRole("button", { name: "Buscar coincidencias" }));
}

describe("search page /buscar (US-013)", () => {
  it("lists the matches with the engine's factors instead of a percentage", async () => {
    searchTrips.mockResolvedValue({
      requestId: "33333333-3333-4333-8333-333333333333",
      matches: [MATCH],
      reason: null,
    });

    await searchFromSanBorja();

    expect(await screen.findByText("1 coincidencia encontrada")).toBeInTheDocument();
    expect(screen.getByText("Mejor coincidencia")).toBeInTheDocument();
    expect(screen.getByText("Mateo Q.")).toBeInTheDocument();
    expect(screen.getByText("La Molina → Centro Empresarial Real")).toBeInTheDocument();
    expect(
      within(screen.getByText("Mateo Q.").closest("li")!).getByText("7:00 a. m."),
    ).toBeInTheDocument();
    expect(screen.getByText("3 asientos")).toBeInTheDocument();
    expect(screen.getByText("+6 min de desvío")).toBeInTheDocument();
    expect(screen.getByText("14 min a pie")).toBeInTheDocument();
    expect(screen.getByText("Llega 07:44")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("shows each result's estimated fuel contribution per person, with its source (US-034)", async () => {
    searchTrips.mockResolvedValue({
      requestId: "33333333-3333-4333-8333-333333333333",
      matches: [
        MATCH,
        { ...MATCH, offerId: "44444444-4444-4444-8444-444444444444", fuelEstimate: null },
      ],
      reason: null,
    });

    await searchFromSanBorja();

    // Each card ends in its "Ver viaje" link; the chips inside a card are list items too.
    const links = await screen.findAllByRole("link", { name: "Ver viaje" });
    const [first, second] = links.map((link) => link.closest("li"));
    expect(
      within(first!).getByText("Aporte de combustible estimado: S/ 5,02 por persona"),
    ).toBeInTheDocument();
    expect(within(first!).getByRole("link", { name: "De dónde sale esta cifra" })).toHaveAttribute(
      "href",
      "/datos#impacto",
    );
    expect(
      within(second!).getByText("No pudimos estimar el combustible de este tramo."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Referencial. Te Jalo no cobra ni procesa pagos; cualquier aporte es voluntario y nunca mayor al costo.",
      ),
    ).toBeInTheDocument();
  });

  it("links each result to the trip detail", async () => {
    searchTrips.mockResolvedValue({
      requestId: "33333333-3333-4333-8333-333333333333",
      matches: [MATCH],
      reason: null,
    });

    await searchFromSanBorja();

    expect(await screen.findByRole("link", { name: "Ver viaje" })).toHaveAttribute(
      "href",
      "/viajes/22222222-2222-4222-8222-222222222222",
    );
  });

  it.each([
    ["outside_time_window", "Ningún conductor sale en ese horario"],
    ["no_seats", "Los viajes cercanos ya están llenos"],
    ["detour_exceeded", "El desvío superaría lo que aceptan los conductores"],
    ["no_walkable_meeting_point", "No hay un punto de encuentro a una distancia caminable"],
  ])("explains an empty result with the engine's reason %s", async (reason, message) => {
    searchTrips.mockResolvedValue({
      requestId: "33333333-3333-4333-8333-333333333333",
      matches: [],
      reason,
    });

    await searchFromSanBorja();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText("0 coincidencias encontradas")).toBeInTheDocument();
  });

  it("says it is searching while the engine answers", async () => {
    searchTrips.mockReturnValue(new Promise(() => {}));

    await searchFromSanBorja();

    expect(await screen.findByText("Buscando viajes compatibles…")).toBeInTheDocument();
  });

  it("always keeps the community's headquarters at one end and flips the direction", async () => {
    searchTrips.mockResolvedValue({
      requestId: "33333333-3333-4333-8333-333333333333",
      matches: [],
      reason: "outside_time_window",
    });
    const user = userEvent.setup();
    render(<BuscarPage />);

    await screen.findByRole("option", { name: "San Borja" });
    expect(
      within(screen.getByRole("group", { name: "Origen" })).getByLabelText("Mi zona"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Destino" })).getByText("Centro Empresarial Real"),
    ).toBeInTheDocument();
    expect(screen.getByText("No pedimos tu dirección exacta")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Invertir sentido" }));
    await user.selectOptions(screen.getByLabelText("Mi zona"), "san-borja");
    await user.click(screen.getByRole("button", { name: "Buscar coincidencias" }));

    expect(
      within(screen.getByRole("group", { name: "Destino" })).getByLabelText("Mi zona"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Origen" })).getByText("Centro Empresarial Real"),
    ).toBeInTheDocument();
    expect(searchTrips).toHaveBeenCalledWith(
      COMMUNITY_ID,
      expect.objectContaining({ direction: "return", originZoneId: "san-borja" }),
    );
  });

  it("sends tomorrow's date in Lima and the chosen time range", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 22:00 UTC is 17:00 in Lima, still 18 October.
    vi.setSystemTime(new Date("2026-10-18T22:00:00.000Z"));
    searchTrips.mockResolvedValue({
      requestId: "33333333-3333-4333-8333-333333333333",
      matches: [],
      reason: "outside_time_window",
    });
    const user = userEvent.setup();
    render(<BuscarPage />);
    await pickSanBorja(user);

    await user.selectOptions(screen.getByLabelText("Fecha"), "Mañana");
    await user.selectOptions(screen.getByLabelText("Desde"), "6:00 p. m.");
    await user.selectOptions(screen.getByLabelText("Hasta"), "7:00 p. m.");
    await user.click(screen.getByRole("button", { name: "Buscar coincidencias" }));

    expect(searchTrips).toHaveBeenCalledWith(
      COMMUNITY_ID,
      expect.objectContaining({
        date: "2026-10-19",
        daysOfWeek: null,
        windowStart: "18:00",
        windowEnd: "19:00",
      }),
    );
  });

  it("searches a recurring trip on the weekdays picked", async () => {
    searchTrips.mockResolvedValue({
      requestId: "33333333-3333-4333-8333-333333333333",
      matches: [],
      reason: "days_mismatch",
    });
    const user = userEvent.setup();
    render(<BuscarPage />);
    await pickSanBorja(user);

    await user.selectOptions(screen.getByLabelText("Fecha"), "Días");
    await user.click(screen.getByRole("button", { name: "Lunes" }));
    await user.click(screen.getByRole("button", { name: "Miércoles" }));
    await user.click(screen.getByRole("button", { name: "Buscar coincidencias" }));

    expect(searchTrips).toHaveBeenCalledWith(
      COMMUNITY_ID,
      expect.objectContaining({ date: null, daysOfWeek: [1, 3] }),
    );
    expect(await screen.findByText("Ningún conductor sale en esos días")).toBeInTheDocument();
  });

  it("asks for a zone before searching", async () => {
    const user = userEvent.setup();
    render(<BuscarPage />);
    await screen.findByLabelText("Mi zona");

    await user.click(screen.getByRole("button", { name: "Buscar coincidencias" }));

    expect(screen.getByText("Selecciona tu zona.")).toBeInTheDocument();
    expect(searchTrips).not.toHaveBeenCalled();
  });

  it("shows the server's message when the search is refused, never a broken page", async () => {
    searchTrips.mockRejectedValue({
      response: { data: { error: "Selecciona una zona de la lista." } },
    });

    await searchFromSanBorja();

    expect(await screen.findByRole("alert")).toHaveTextContent("Selecciona una zona de la lista.");
    expect(screen.queryByText("Buscando viajes compatibles…")).not.toBeInTheDocument();
  });

  it("widens the time range by 15 minutes and searches again", async () => {
    searchTrips
      .mockResolvedValueOnce({
        requestId: "33333333-3333-4333-8333-333333333333",
        matches: [],
        reason: "outside_time_window",
      })
      .mockResolvedValueOnce({
        requestId: "33333333-3333-4333-8333-333333333333",
        matches: [MATCH],
        reason: null,
      });
    const user = userEvent.setup();

    await searchFromSanBorja();
    await user.click(await screen.findByRole("button", { name: "Ampliar horario 15 min" }));

    expect(searchTrips).toHaveBeenLastCalledWith(
      COMMUNITY_ID,
      expect.objectContaining({ windowStart: "07:15", windowEnd: "08:45" }),
    );
    expect(await screen.findByText("1 coincidencia encontrada")).toBeInTheDocument();
  });

  it("preloads how the person usually travels and sends the one they pick", async () => {
    getMe.mockResolvedValue({
      ...ME,
      memberships: [membership({ usualMode: "car_passenger" })],
    });
    searchTrips.mockResolvedValue({
      requestId: "33333333-3333-4333-8333-333333333333",
      matches: [],
      reason: "outside_time_window",
    });
    const user = userEvent.setup();
    render(<BuscarPage />);
    await pickSanBorja(user);

    const fallback = screen.getByLabelText("Si no encuentras viaje, ¿cómo irías?");
    expect(fallback).toHaveDisplayValue("Me recogen");

    await user.selectOptions(fallback, "Bus, combi, Corredor o metro");
    await user.click(screen.getByRole("button", { name: "Buscar coincidencias" }));

    expect(searchTrips).toHaveBeenCalledWith(
      COMMUNITY_ID,
      expect.objectContaining({ fallbackMode: "public_transport" }),
    );
  });

  it("offers Solo mujeres only to who identifies as a woman, and sends it", async () => {
    getMe.mockResolvedValue({
      ...ME,
      memberships: [membership({ identifiesAsWoman: true, womenOnly: false })],
    });
    searchTrips.mockResolvedValue({
      requestId: "33333333-3333-4333-8333-333333333333",
      matches: [],
      reason: "women_only",
    });
    const user = userEvent.setup();
    render(<BuscarPage />);
    await pickSanBorja(user);

    await user.click(screen.getByRole("checkbox", { name: "Solo mujeres" }));
    await user.click(screen.getByRole("button", { name: "Buscar coincidencias" }));

    expect(searchTrips).toHaveBeenCalledWith(
      COMMUNITY_ID,
      expect.objectContaining({ womenOnly: true }),
    );
  });

  it("starts with Solo mujeres on when the profile has it on (US-026)", async () => {
    getMe.mockResolvedValue({
      ...ME,
      memberships: [membership({ identifiesAsWoman: true, womenOnly: true })],
    });
    searchTrips.mockResolvedValue({
      requestId: "33333333-3333-4333-8333-333333333333",
      matches: [],
      reason: "women_only",
    });

    await searchFromSanBorja();

    expect(screen.getByRole("checkbox", { name: "Solo mujeres" })).toBeChecked();
    expect(searchTrips).toHaveBeenCalledWith(
      COMMUNITY_ID,
      expect.objectContaining({ womenOnly: true }),
    );
  });

  it("does not show Solo mujeres, nor a verified-members switch, to everyone else", async () => {
    render(<BuscarPage />);
    await screen.findByLabelText("Mi zona");

    expect(screen.queryByRole("checkbox", { name: "Solo mujeres" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Solo miembros verificados/)).not.toBeInTheDocument();
  });

  it("asks for the community only when the person belongs to more than one", async () => {
    const BETA_ID = "55555555-5555-4555-8555-555555555555";
    getMe.mockResolvedValue({
      ...ME,
      memberships: [
        membership(),
        membership({
          id: "m-2",
          communityId: BETA_ID,
          communityName: "Universidad Beta",
          destinationName: "Campus Beta",
        }),
      ],
    });
    searchTrips.mockResolvedValue({
      requestId: "33333333-3333-4333-8333-333333333333",
      matches: [],
      reason: "outside_time_window",
    });
    const user = userEvent.setup();
    render(<BuscarPage />);

    await user.selectOptions(await screen.findByLabelText("Comunidad"), "Universidad Beta");
    expect(listCommunityZones).toHaveBeenLastCalledWith(BETA_ID);
    expect(screen.getByText("Campus Beta")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Mi zona"), "san-borja");
    await user.click(screen.getByRole("button", { name: "Buscar coincidencias" }));

    expect(searchTrips).toHaveBeenCalledWith(BETA_ID, expect.anything());
  });

  it("does not ask for the community when there is only one", async () => {
    render(<BuscarPage />);
    await screen.findByLabelText("Mi zona");

    expect(screen.queryByLabelText("Comunidad")).not.toBeInTheDocument();
  });

  it("searches a single date picked on the calendar", async () => {
    searchTrips.mockResolvedValue({
      requestId: "33333333-3333-4333-8333-333333333333",
      matches: [],
      reason: "outside_time_window",
    });
    const user = userEvent.setup();
    render(<BuscarPage />);
    await pickSanBorja(user);

    await user.selectOptions(screen.getByLabelText("Fecha"), "Otra fecha");
    fireEvent.change(screen.getByLabelText("Día del viaje"), { target: { value: "2026-11-02" } });
    await user.click(screen.getByRole("button", { name: "Buscar coincidencias" }));

    expect(searchTrips).toHaveBeenCalledWith(
      COMMUNITY_ID,
      expect.objectContaining({ date: "2026-11-02", daysOfWeek: null }),
    );
  });

  it("tells the person their need was saved when nothing matched", async () => {
    searchTrips.mockResolvedValue({
      requestId: "33333333-3333-4333-8333-333333333333",
      matches: [],
      reason: "outside_time_window",
    });

    await searchFromSanBorja();

    expect(
      await screen.findByText("Guardamos tu búsqueda para el emparejamiento de la jornada."),
    ).toBeInTheDocument();
  });

  it("says when the zones could not be loaded", async () => {
    listCommunityZones.mockRejectedValue(new Error("network"));

    render(<BuscarPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos cargar tus zonas. Inténtalo de nuevo.",
    );
  });

  it("says when the account could not be loaded", async () => {
    getMe.mockRejectedValue(new Error("network"));

    render(<BuscarPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos cargar tu cuenta. Inténtalo de nuevo.",
    );
  });

  it("asks for the date before searching another day", async () => {
    const user = userEvent.setup();
    render(<BuscarPage />);
    await pickSanBorja(user);

    await user.selectOptions(screen.getByLabelText("Fecha"), "Otra fecha");
    await user.click(screen.getByRole("button", { name: "Buscar coincidencias" }));

    expect(screen.getByText("Elige la fecha del viaje.")).toBeInTheDocument();
    expect(searchTrips).not.toHaveBeenCalled();
  });

  it("asks for at least one weekday before searching a recurring trip", async () => {
    const user = userEvent.setup();
    render(<BuscarPage />);
    await pickSanBorja(user);

    await user.selectOptions(screen.getByLabelText("Fecha"), "Días");
    await user.click(screen.getByRole("button", { name: "Buscar coincidencias" }));

    expect(screen.getByText("Elige al menos un día.")).toBeInTheDocument();
    expect(searchTrips).not.toHaveBeenCalled();
  });

  it("does not send a second search while one is in progress", async () => {
    searchTrips.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<BuscarPage />);
    await pickSanBorja(user);
    const button = screen.getByRole("button", { name: "Buscar coincidencias" });

    await user.click(button);
    await user.click(button);

    expect(searchTrips).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });

  it("never reveals that a driver turned the person down", async () => {
    searchTrips.mockResolvedValue({
      requestId: "33333333-3333-4333-8333-333333333333",
      matches: [],
      reason: "previously_rejected",
    });

    await searchFromSanBorja();

    expect(
      await screen.findByText("No encontramos más viajes disponibles para este recorrido."),
    ).toBeInTheDocument();
  });

  it("announces the number of matches politely to screen readers", async () => {
    searchTrips.mockResolvedValue({
      requestId: "33333333-3333-4333-8333-333333333333",
      matches: [MATCH],
      reason: null,
    });

    await searchFromSanBorja();

    const count = await screen.findByText("1 coincidencia encontrada");
    expect(count.closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
  });
});

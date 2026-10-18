import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const replace = vi.fn();
const getMe = vi.fn();
const listVehicles = vi.fn();
const createVehicle = vi.fn();
const listCommunityZones = vi.fn();
const createCommunityOffer = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
vi.mock("@/lib/communities-api", () => ({
  communitiesApi: {
    getMe: (...args: unknown[]) => getMe(...args),
    listVehicles: (...args: unknown[]) => listVehicles(...args),
    createVehicle: (...args: unknown[]) => createVehicle(...args),
    listCommunityZones: (...args: unknown[]) => listCommunityZones(...args),
    createCommunityOffer: (...args: unknown[]) => createCommunityOffer(...args),
  },
}));

import OfferPage from "./page";

const ONBOARDED_ME = {
  user: { id: "u-mateo", name: "Mateo", email: "mateo@alfa.pe" },
  memberships: [
    {
      id: "m-1",
      communityId: "11111111-1111-4111-8111-111111111111",
      communityName: "Comunidad Alfa",
      destinationName: "Centro Empresarial Real",
      role: "member" as const,
      verificationMethod: "join_code" as const,
      consentVersion: "v1",
      consentAt: "2026-10-18T10:00:00.000Z",
      usualMode: "drove_alone" as const,
      travelRole: "driver" as const,
      alias: "Mateo",
      identifiesAsWoman: false,
      womenOnly: false,
      isTeam: false,
    },
  ],
};

const ZONES = [
  {
    id: "san-isidro",
    name: "San Isidro (Óvalo Gutiérrez)",
    district: "San Isidro",
    lat: -12.1049,
    lng: -77.0372,
  },
  {
    id: "miraflores",
    name: "Miraflores (Parque Kennedy)",
    district: "Miraflores",
    lat: -12.1211,
    lng: -77.0294,
  },
];

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  getMe.mockReset();
  listVehicles.mockReset();
  createVehicle.mockReset();
  listCommunityZones.mockReset();
  createCommunityOffer.mockReset();
  getMe.mockResolvedValue(ONBOARDED_ME);
  listCommunityZones.mockResolvedValue(ZONES);
});

describe("offer page /ofrecer (US-012)", () => {
  it("registers a vehicle when the driver has none (handling 409 duplicate plate), then publishes a recurring trip offer", async () => {
    listVehicles.mockResolvedValue([]);
    createVehicle.mockRejectedValueOnce({ response: { status: 409 } }).mockResolvedValueOnce({
      id: "33333333-3333-4333-8333-333333333333",
      plate: "ABC123",
      make: "Toyota",
      model: "Corolla",
      color: "Gris",
      seats: 3,
    });
    createCommunityOffer.mockResolvedValueOnce({
      offer: {
        id: "44444444-4444-4444-8444-444444444444",
        communityId: ONBOARDED_ME.memberships[0]!.communityId,
        driverId: "u-mateo",
        vehicleId: "33333333-3333-4333-8333-333333333333",
        direction: "outbound",
        originZoneId: "san-isidro",
        departureTime: "07:30",
        daysOfWeek: [1, 3],
        date: null,
        seatsTotal: 3,
        seatsTaken: 0,
        maxDetourMinutes: 5,
        womenOnly: false,
        note: "Paso por Javier Prado",
        status: "active",
      },
      message: "Viaje publicado.",
    });

    const user = userEvent.setup();
    render(<OfferPage />);

    expect(await screen.findByRole("heading", { name: "Tu vehículo" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Solo con pasajeras mujeres")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Placa"), "abc-123");
    await user.type(screen.getByLabelText("Marca y modelo"), "Toyota Corolla");
    await user.type(screen.getByLabelText("Color"), "Gris");
    await user.clear(screen.getByLabelText("Asientos disponibles para compartir"));
    await user.type(screen.getByLabelText("Asientos disponibles para compartir"), "3");

    // 1. First vehicle registration attempt returns 409
    await user.click(screen.getByRole("button", { name: "Guardar vehículo" }));
    expect(await screen.findByText("Esta placa ya está registrada.")).toBeInTheDocument();

    // 2. Second attempt succeeds and preselects the vehicle with seats=3
    await user.click(screen.getByRole("button", { name: "Guardar vehículo" }));
    expect(await screen.findByText(/Toyota Corolla · ABC123/i)).toBeInTheDocument();

    // 3. Configure recurring trip offer (L and X, 07:30, Hasta 5 min default, note)
    await user.click(screen.getByRole("button", { name: "L" }));
    await user.click(screen.getByRole("button", { name: "X" }));
    await user.type(screen.getByLabelText("Nota opcional"), "Paso por Javier Prado");

    await user.click(screen.getByRole("button", { name: "Publicar viaje" }));

    expect(await screen.findByText("Viaje publicado.")).toBeInTheDocument();
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/viajes"));
    expect(createCommunityOffer).toHaveBeenCalledWith(
      ONBOARDED_ME.memberships[0]!.communityId,
      expect.objectContaining({
        vehicleId: "33333333-3333-4333-8333-333333333333",
        direction: "outbound",
        originZoneId: "san-isidro",
        daysOfWeek: [1, 3],
        seatsTotal: 3,
        maxDetourMinutes: 5,
        womenOnly: false,
        note: "Paso por Javier Prado",
      }),
    );
  });

  it("blocks seatsTotal > vehicle.seats, supports switching to return direction and single-day mode, and shows Solo con pasajeras mujeres when identifiesAsWoman is true", async () => {
    getMe.mockResolvedValue({
      ...ONBOARDED_ME,
      memberships: [
        {
          ...ONBOARDED_ME.memberships[0]!,
          identifiesAsWoman: true,
        },
      ],
    });
    listVehicles.mockResolvedValue([
      {
        id: "33333333-3333-4333-8333-333333333333",
        plate: "ABC123",
        make: "Toyota",
        model: "Corolla",
        color: "Gris",
        seats: 2,
      },
    ]);

    const user = userEvent.setup();
    render(<OfferPage />);

    expect(await screen.findByText(/Toyota Corolla · ABC123/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Solo con pasajeras mujeres")).toBeInTheDocument();

    // Switch direction to return -> label changes to Zona de llegada
    await user.click(
      screen.getByRole("button", { name: "De regreso desde Centro Empresarial Real" }),
    );
    expect(screen.getByLabelText("Zona de llegada")).toBeInTheDocument();

    // Try setting seats > vehicle.seats (3 > 2)
    const seatsInput = screen.getByLabelText("Asientos para este viaje");
    await user.clear(seatsInput);
    await user.type(seatsInput, "3");
    await user.click(screen.getByRole("button", { name: "L" }));
    await user.click(screen.getByRole("button", { name: "Publicar viaje" }));

    expect(
      await screen.findByText("No puedes ofrecer más asientos de los que tiene tu vehículo."),
    ).toBeInTheDocument();
    expect(createCommunityOffer).not.toHaveBeenCalled();
  });
});

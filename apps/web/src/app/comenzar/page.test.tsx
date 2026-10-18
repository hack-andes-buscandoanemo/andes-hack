import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const replace = vi.fn();
const getMe = vi.fn();
const updateMembership = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
vi.mock("@/lib/communities-api", () => ({
  communitiesApi: {
    getMe: (...args: unknown[]) => getMe(...args),
    updateMembership: (...args: unknown[]) => updateMembership(...args),
  },
}));

import OnboardingPage from "./page";

const INCOMPLETE_ME = {
  user: {
    id: "u-sofia",
    name: "Sofía Quispe",
    email: "sofia@alfa.pe",
  },
  memberships: [
    {
      id: "m-1",
      communityId: "11111111-1111-4111-8111-111111111111",
      communityName: "Comunidad Alfa",
      destinationName: "Centro Empresarial Real",
      role: "member" as const,
      verificationMethod: "join_code" as const,
      consentVersion: null,
      consentAt: null,
      usualMode: null,
      travelRole: null,
      alias: null,
      identifiesAsWoman: false,
      womenOnly: false,
      isTeam: false,
    },
  ],
};

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  getMe.mockReset();
  updateMembership.mockReset();
  getMe.mockResolvedValue(INCOMPLETE_ME);
});

describe("onboarding page /comenzar (US-011)", () => {
  it("renders consent, 6 baseline travel modes, 3 participation roles, and prefills first name as Nombre visible", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    expect(
      await screen.findByText("El último día que fuiste a Centro Empresarial Real, ¿cómo fuiste?"),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Te Jalo es una herramienta comunitaria para coordinar viajes compartidos al mismo destino entre personas de tu entidad. No somos una empresa de transporte ni intermediamos pagos. Cada persona decide con quién viajar y cómo dividir los gastos reales del viaje.",
      ),
    ).toBeInTheDocument();

    const aliasInput = screen.getByLabelText("Nombre visible");
    expect(aliasInput).toHaveValue("Sofía");

    // Validation errors when submitting without consent or mode
    await user.click(screen.getByRole("button", { name: "Guardar y empezar" }));
    expect(
      await screen.findByText("Debes aceptar las condiciones para continuar."),
    ).toBeInTheDocument();
    expect(screen.getByText("Elige cómo viajaste la última vez.")).toBeInTheDocument();
    expect(updateMembership).not.toHaveBeenCalled();

    // Select consent, mode, and role
    await user.click(screen.getByLabelText("Tengo 18 años o más y acepto estas condiciones"));
    await user.click(screen.getByRole("button", { name: "En mi auto, solo/a" }));
    await user.click(screen.getByRole("button", { name: "Tengo vehículo y puedo llevar gente" }));

    updateMembership.mockResolvedValueOnce({
      ...INCOMPLETE_ME.memberships[0],
      consentVersion: "v1",
      consentAt: "2026-10-18T14:30:00.000Z",
      usualMode: "drove_alone",
      travelRole: "driver",
      alias: "Sofía",
    });

    await user.click(screen.getByRole("button", { name: "Guardar y empezar" }));

    await vi.waitFor(() =>
      expect(updateMembership).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", {
        consentAccepted: true,
        usualMode: "drove_alone",
        travelRole: "driver",
        alias: "Sofía",
      }),
    );
    expect(push).toHaveBeenCalledWith("/inicio");
  });

  it("redirects already-onboarded members straight to /inicio so onboarding only appears once", async () => {
    getMe.mockResolvedValueOnce({
      ...INCOMPLETE_ME,
      memberships: [
        {
          ...INCOMPLETE_ME.memberships[0],
          consentVersion: "v1",
          consentAt: "2026-10-18T10:00:00.000Z",
          usualMode: "public_transport",
          travelRole: "passenger",
        },
      ],
    });

    render(<OnboardingPage />);

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/inicio"));
  });
});

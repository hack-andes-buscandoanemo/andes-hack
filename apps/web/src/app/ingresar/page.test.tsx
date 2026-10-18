import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const listCommunities = vi.fn();
const joinCommunity = vi.fn();
const sendEmailOtp = vi.fn();
const verifyEmailOtp = vi.fn();
const confirmEmailMembership = vi.fn();
const useSession = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => useSession(),
  },
}));
vi.mock("@/lib/communities-api", () => ({
  communitiesApi: {
    listCommunities: (...args: unknown[]) => listCommunities(...args),
    joinCommunity: (...args: unknown[]) => joinCommunity(...args),
    sendEmailOtp: (...args: unknown[]) => sendEmailOtp(...args),
    verifyEmailOtp: (...args: unknown[]) => verifyEmailOtp(...args),
    confirmEmailMembership: (...args: unknown[]) => confirmEmailMembership(...args),
  },
}));

import EnterPage from "./page";

const DEMO_COMMUNITY = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Comunidad Alfa",
  kind: "company" as const,
  isDemo: true,
  hasEmailVerification: false,
  matchedEmailDomain: null,
};

const UNI_COMMUNITY = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Universidad del Pacífico Sur",
  kind: "university" as const,
  isDemo: false,
  hasEmailVerification: true,
  matchedEmailDomain: "@upacifico.edu.pe",
};

beforeEach(() => {
  push.mockClear();
  listCommunities.mockReset();
  joinCommunity.mockReset();
  sendEmailOtp.mockReset();
  verifyEmailOtp.mockReset();
  confirmEmailMembership.mockReset();
  useSession.mockReturnValue({
    data: { user: { id: "u1", name: "Ana", email: "ana@upacifico.edu.pe" } },
    isPending: false,
  });
  listCommunities.mockResolvedValue([DEMO_COMMUNITY, UNI_COMMUNITY]);
});

describe("enter page (US-009 & US-010)", () => {
  it("offers to create an account or sign in", async () => {
    render(<EnterPage />);
    await screen.findByText("Comunidad Alfa");

    expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute(
      "href",
      "/crear-cuenta",
    );
    expect(screen.getByRole("link", { name: "Ya tengo una cuenta" })).toHaveAttribute(
      "href",
      "/iniciar-sesion",
    );
  });

  it("filters communities, displays kind and Datos sintéticos label, and joins with a valid access code", async () => {
    let resolveJoin!: (value: unknown) => void;
    joinCommunity.mockReturnValue(
      new Promise((resolve) => {
        resolveJoin = resolve;
      }),
    );

    const user = userEvent.setup();
    render(<EnterPage />);

    expect(await screen.findByText("Comunidad Alfa")).toBeInTheDocument();
    expect(screen.getByText("Empresa")).toBeInTheDocument();
    expect(screen.getByText("Datos sintéticos")).toBeInTheDocument();
    expect(screen.getByText("Universidad")).toBeInTheDocument();

    const searchInput = screen.getByLabelText("Elige tu comunidad");
    await user.type(searchInput, "Alfa");
    expect(screen.queryByText("Universidad del Pacífico Sur")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Comunidad Alfa/i }));
    await user.type(screen.getByLabelText("Código de acceso"), "ALFA2026");
    await user.click(screen.getByRole("button", { name: "Unirme" }));

    expect(screen.getByRole("button", { name: "Validando código…" })).toBeDisabled();

    resolveJoin({
      joined: true,
      alreadyMember: false,
      communityId: DEMO_COMMUNITY.id,
      communityName: "Comunidad Alfa",
      verificationMethod: "join_code",
      isTeam: false,
      message: "¡Listo! Ya eres parte de Comunidad Alfa.",
    });

    expect(await screen.findByText("¡Listo! Ya eres parte de Comunidad Alfa.")).toBeInTheDocument();
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/comenzar"));
    expect(joinCommunity).toHaveBeenCalledWith(DEMO_COMMUNITY.id, "ALFA2026");
  });

  it("handles empty/invalid code, rate-limited attempts (429), and existing membership without error", async () => {
    const user = userEvent.setup();
    render(<EnterPage />);
    await screen.findByText("Comunidad Alfa");

    // 1. Empty code does not call server
    await user.click(screen.getByRole("button", { name: "Unirme" }));
    expect(
      await screen.findByText("El código no es válido para esta comunidad."),
    ).toBeInTheDocument();
    expect(joinCommunity).not.toHaveBeenCalled();

    // 2. Rate limited (429)
    joinCommunity.mockRejectedValueOnce({ response: { status: 429 } });
    await user.type(screen.getByLabelText("Código de acceso"), "WRONG123");
    await user.click(screen.getByRole("button", { name: "Unirme" }));
    expect(
      await screen.findByText("Demasiados intentos. Espera unos minutos."),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    // 3. Already a member continues without error
    joinCommunity.mockResolvedValueOnce({
      joined: true,
      alreadyMember: true,
      communityId: DEMO_COMMUNITY.id,
      communityName: "Comunidad Alfa",
      verificationMethod: "join_code",
      isTeam: false,
      message: "¡Listo! Ya eres parte de Comunidad Alfa.",
    });
    await user.click(screen.getByRole("button", { name: "Unirme" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/comenzar"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("verifies institutional email with 6-digit OTP, enforces 60s resend cooldown, and handles invalid OTP", async () => {
    sendEmailOtp.mockResolvedValue({ success: true });
    verifyEmailOtp
      .mockRejectedValueOnce(new Error("INVALID_OTP"))
      .mockResolvedValueOnce({ success: true });
    confirmEmailMembership.mockResolvedValue({
      joined: true,
      alreadyMember: false,
      communityId: UNI_COMMUNITY.id,
      communityName: UNI_COMMUNITY.name,
      verificationMethod: "email_domain",
      isTeam: false,
      message: "Pertenencia verificada.",
    });

    const user = userEvent.setup();
    render(<EnterPage />);
    await screen.findByText("Universidad del Pacífico Sur");

    await user.click(screen.getByRole("button", { name: /Universidad del Pacífico Sur/i }));
    await user.click(screen.getByRole("button", { name: "Verificar con correo institucional" }));

    expect(
      screen.getByText("Usa tu correo de Universidad del Pacífico Sur (@upacifico.edu.pe)"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Enviar código" }));

    expect(
      await screen.findByText("Te enviamos un código a ana@upacifico.edu.pe. Vence en 5 minutos."),
    ).toBeInTheDocument();
    expect(sendEmailOtp).toHaveBeenCalledWith(UNI_COMMUNITY.id, "ana@upacifico.edu.pe");
    expect(screen.getByRole("button", { name: /Reenviar código/i })).toBeDisabled();

    // Invalid OTP first
    const otpInput = screen.getByLabelText("Código de 6 dígitos");
    await user.type(otpInput, "000000");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    expect(await screen.findByText("El código no es válido o ya venció.")).toBeInTheDocument();

    // Valid OTP
    await user.clear(otpInput);
    await user.type(otpInput, "123456");
    await user.click(screen.getByRole("button", { name: "Verificar" }));

    expect(await screen.findByText("Pertenencia verificada.")).toBeInTheDocument();
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/comenzar"));
    expect(verifyEmailOtp).toHaveBeenLastCalledWith("ana@upacifico.edu.pe", "123456");
    expect(confirmEmailMembership).toHaveBeenCalledWith(UNI_COMMUNITY.id);
  });

  it("blocks institutional verification and explains how to create an institutional account when the email domain does not match", async () => {
    useSession.mockReturnValue({
      data: { user: { id: "u2", name: "Pedro", email: "pedro@gmail.com" } },
      isPending: false,
    });
    listCommunities.mockResolvedValue([
      DEMO_COMMUNITY,
      { ...UNI_COMMUNITY, matchedEmailDomain: null },
    ]);

    const user = userEvent.setup();
    render(<EnterPage />);
    await screen.findByText("Universidad del Pacífico Sur");

    await user.click(screen.getByRole("button", { name: /Universidad del Pacífico Sur/i }));
    await user.click(screen.getByRole("button", { name: "Verificar con correo institucional" }));

    expect(
      screen.getByText(
        "Tu cuenta usa un correo que no pertenece a Universidad del Pacífico Sur. Crea tu cuenta con tu correo institucional.",
      ),
    ).toBeInTheDocument();
    expect(sendEmailOtp).not.toHaveBeenCalled();
  });
});

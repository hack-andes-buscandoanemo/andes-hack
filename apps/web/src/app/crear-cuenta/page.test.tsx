import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const signUpEmail = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { signUp: { email: (...args: unknown[]) => signUpEmail(...args) } },
}));

import SignUpPage from "./page";

async function fillAndSubmit(values: { name?: string; email: string; password: string }) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Nombre"), values.name ?? "Ana Quispe");
  await user.type(screen.getByLabelText("Correo electrónico"), values.email);
  await user.type(screen.getByLabelText("Contraseña"), values.password);
  await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
}

beforeEach(() => {
  push.mockClear();
  signUpEmail.mockReset();
});

describe("sign-up page", () => {
  it("shows a Spanish error next to the email field and does not create the account", async () => {
    render(<SignUpPage />);

    await fillAndSubmit({ email: "ana@", password: "12345678" });

    expect(await screen.findByText("Escribe un correo válido.")).toBeInTheDocument();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than 8 characters", async () => {
    render(<SignUpPage />);

    await fillAndSubmit({ email: "ana@uni.edu.pe", password: "1234567" });

    expect(
      await screen.findByText("La contraseña debe tener al menos 8 caracteres."),
    ).toBeInTheDocument();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("requires a name of at least 2 characters", async () => {
    render(<SignUpPage />);

    await fillAndSubmit({ name: "A", email: "ana@uni.edu.pe", password: "12345678" });

    expect(
      await screen.findByText("El nombre debe tener al menos 2 caracteres."),
    ).toBeInTheDocument();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("creates the account and continues when the data is valid", async () => {
    signUpEmail.mockImplementation(async (_data, callbacks) => callbacks.onSuccess());
    render(<SignUpPage />);

    await fillAndSubmit({ email: "ana@uni.edu.pe", password: "12345678" });

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(signUpEmail).toHaveBeenCalledWith(
      { name: "Ana Quispe", email: "ana@uni.edu.pe", password: "12345678" },
      expect.anything(),
    );
  });

  it("tells the person to sign in when the email is already registered", async () => {
    signUpEmail.mockImplementation(async (_data, callbacks) =>
      callbacks.onError({ error: { code: "USER_ALREADY_EXISTS", status: 422 } }),
    );
    render(<SignUpPage />);

    await fillAndSubmit({ email: "ana@uni.edu.pe", password: "12345678" });

    expect(
      await screen.findByText("Ya existe una cuenta con este correo. Inicia sesión."),
    ).toBeInTheDocument();
  });

  it("shows a generic Spanish error when sign-up fails for another reason", async () => {
    signUpEmail.mockImplementation(async (_data, callbacks) =>
      callbacks.onError({ error: { code: "INTERNAL", status: 500 } }),
    );
    render(<SignUpPage />);

    await fillAndSubmit({ email: "ana@uni.edu.pe", password: "12345678" });

    expect(
      await screen.findByText("No pudimos crear tu cuenta. Revisa tus datos e inténtalo de nuevo."),
    ).toBeInTheDocument();
  });
});

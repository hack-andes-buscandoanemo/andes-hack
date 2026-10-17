import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const signInEmail = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { email: (...args: unknown[]) => signInEmail(...args) } },
}));

import SignInPage from "./page";

async function fillAndSubmit(values: { email: string; password: string }) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Correo electrónico"), values.email);
  await user.type(screen.getByLabelText("Contraseña"), values.password);
  await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));
}

beforeEach(() => {
  push.mockClear();
  signInEmail.mockReset();
});

describe("sign-in page", () => {
  it("shows a Spanish error next to the email field and does not call the server", async () => {
    render(<SignInPage />);

    await fillAndSubmit({ email: "ana@", password: "12345678" });

    expect(await screen.findByText("Escribe un correo válido.")).toBeInTheDocument();
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("signs in and continues when the credentials are accepted", async () => {
    signInEmail.mockImplementation(async (_data, callbacks) => callbacks.onSuccess());
    render(<SignInPage />);

    await fillAndSubmit({ email: "ana@uni.edu.pe", password: "12345678" });

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(signInEmail).toHaveBeenCalledWith(
      { email: "ana@uni.edu.pe", password: "12345678" },
      expect.anything(),
    );
  });

  it("reports wrong credentials in Spanish", async () => {
    signInEmail.mockImplementation(async (_data, callbacks) =>
      callbacks.onError({ error: { code: "INVALID_EMAIL_OR_PASSWORD", status: 401 } }),
    );
    render(<SignInPage />);

    await fillAndSubmit({ email: "ana@uni.edu.pe", password: "12345678" });

    expect(await screen.findByText("Correo o contraseña incorrectos.")).toBeInTheDocument();
  });

  it("shows a generic Spanish error when sign-in fails for another reason", async () => {
    signInEmail.mockImplementation(async (_data, callbacks) =>
      callbacks.onError({ error: { code: "INTERNAL_SERVER_ERROR", status: 500 } }),
    );
    render(<SignInPage />);

    await fillAndSubmit({ email: "ana@uni.edu.pe", password: "12345678" });

    expect(
      await screen.findByText("No pudimos iniciar sesión. Inténtalo de nuevo."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Correo o contraseña incorrectos.")).not.toBeInTheDocument();
  });

  it("links to the sign-up page for people without an account", () => {
    render(<SignInPage />);

    expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute(
      "href",
      "/crear-cuenta",
    );
  });
});

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const useSession = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: () => useSession() } }));

import Home from "./page";

beforeEach(() => {
  replace.mockClear();
  useSession.mockReturnValue({ data: null, isPending: false });
});

describe("welcome screen", () => {
  it("introduces Te Jalo with its slogan and subtitle", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1, name: "Te Jalo" })).toBeInTheDocument();
    expect(screen.getByText("Compartimos rutas, movemos Lima")).toBeInTheDocument();
    expect(
      screen.getByText("Movilidad compartida entre comunidades verificadas"),
    ).toBeInTheDocument();
  });

  it("explains the four benefits without commercial or absolute claims", () => {
    render(<Home />);

    const cards = [
      ["Comunidades verificadas", "Solo miembros de entidades aliadas."],
      ["Rutas compatibles", "Te conectamos con personas que hacen rutas similares."],
      ["Gastos compartidos", "Estimamos el aporte de combustible de cada tramo. La app no cobra."],
      ["Movilidad sostenible", "Menos autos con un solo ocupante en tu comunidad."],
    ];
    for (const [title, body] of cards) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
      expect(screen.getByText(body)).toBeInTheDocument();
    }
    expect(document.body.textContent).not.toMatch(/garantiza|100% seguro|tarifa|precio|cobro/i);
  });

  it("offers entry, sign-up and sign-in paths plus footer links", () => {
    render(<Home />);

    const links = [
      ["Ingresar con mi entidad", "/ingresar"],
      ["Crear cuenta", "/crear-cuenta"],
      ["Ya tengo una cuenta", "/iniciar-sesion"],
      ["Impacto en vivo", "/panel"],
      ["Datos y supuestos", "/datos"],
      ["¿Tu institución quiere sumarse?", "/instituciones"],
    ];
    for (const [name, href] of links) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(screen.getByText("Conectamos personas que ya recorren rutas similares")).toBeVisible();
  });

  it("sends a signed-in member to Inicio", () => {
    useSession.mockReturnValue({ data: { user: { name: "Ana" } }, isPending: false });

    render(<Home />);

    expect(replace).toHaveBeenCalledWith("/dashboard");
  });

  it("keeps a visitor without session on the welcome screen", () => {
    render(<Home />);

    expect(replace).not.toHaveBeenCalled();
  });
});

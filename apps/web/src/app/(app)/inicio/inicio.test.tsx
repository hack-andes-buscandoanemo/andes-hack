import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Inicio from "./inicio";

describe("inicio", () => {
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

  it("explains the empty states instead of inventing data", () => {
    render(<Inicio name="Ana" />);

    expect(
      screen.getByText("Aún no tienes viajes. Busca uno o publica el que ya haces."),
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

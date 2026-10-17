import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const usePathname = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => usePathname() }));

import AppShell from "./app-shell";

beforeEach(() => usePathname.mockReturnValue("/inicio"));

const shell = () =>
  render(
    <AppShell name="Ana Pérez">
      <p>contenido</p>
    </AppShell>,
  );

describe("app shell", () => {
  it("shows the Te Jalo logo, the alerts bell and the member initials", () => {
    shell();

    expect(screen.getByText("Te Jalo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Avisos" })).toBeInTheDocument();
    expect(screen.getByLabelText("Perfil de Ana Pérez")).toHaveTextContent("AP");
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("offers the five sections in the bottom bar", () => {
    shell();

    const links = within(screen.getByRole("navigation", { name: "Principal" })).getAllByRole(
      "link",
    );
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Inicio", "/inicio"],
      ["Buscar", "/buscar"],
      ["Viajes", "/viajes"],
      ["Chat", "/chat"],
      ["Perfil", "/perfil"],
    ]);
  });

  it("marks only the current section as active", () => {
    usePathname.mockReturnValue("/viajes");
    shell();

    expect(screen.getByRole("link", { name: "Viajes" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("keeps every bottom item at least 44px tall", () => {
    shell();

    for (const link of screen.getAllByRole("link", {
      name: /^(Inicio|Buscar|Viajes|Chat|Perfil)$/,
    })) {
      expect(link.className).toContain("min-h-14");
    }
  });
});

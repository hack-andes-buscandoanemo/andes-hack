import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const usePathname = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => usePathname() }));

import AppShell from "./app-shell";

beforeEach(() => usePathname.mockReturnValue("/inicio"));

const shell = (isAdmin = false) =>
  render(
    <AppShell name="Ana Pérez" isAdmin={isAdmin}>
      <p>contenido</p>
    </AppShell>,
  );

describe("app shell", () => {
  it("shows the Te Jalo logo, the alerts bell and the member initials", () => {
    shell();

    expect(screen.getByText("Te Jalo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Avisos (próximamente)" })).toBeDisabled();
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

  it("shows incident reports only to community admins", () => {
    const { unmount } = shell();
    expect(screen.queryByRole("link", { name: "Reportes" })).not.toBeInTheDocument();
    unmount();

    shell(true);
    expect(screen.getByRole("link", { name: "Reportes" })).toHaveAttribute(
      "href",
      "/comunidad/reportes",
    );
  });

  it("marks only the current section as active", () => {
    usePathname.mockReturnValue("/viajes");
    shell();

    expect(screen.getByRole("link", { name: "Viajes" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("keeps the section active on nested routes", () => {
    usePathname.mockReturnValue("/viajes/123");
    shell();

    expect(screen.getByRole("link", { name: "Viajes" })).toHaveAttribute("aria-current", "page");
  });

  it("does not activate a section whose name only shares a prefix", () => {
    usePathname.mockReturnValue("/viajesx");
    shell();

    expect(screen.getByRole("link", { name: "Viajes" })).not.toHaveAttribute("aria-current");
  });
});

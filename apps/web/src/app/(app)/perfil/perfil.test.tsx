import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const signOut = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: (...args: unknown[]) => signOut(...args) },
}));

import Perfil from "./perfil";

beforeEach(() => {
  push.mockClear();
  signOut.mockReset();
});

describe("perfil", () => {
  it("shows the account name and email", () => {
    render(<Perfil name="Ana" email="ana@uni.pe" />);

    expect(screen.getByRole("heading", { level: 1, name: "Perfil" })).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("ana@uni.pe")).toBeInTheDocument();
  });

  it("signs out and returns to the welcome screen", async () => {
    signOut.mockResolvedValue({});
    render(<Perfil name="Ana" email="ana@uni.pe" />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(signOut).toHaveBeenCalled();
  });

  it("links to the trip history", () => {
    render(<Perfil name="Ana" email="ana@uni.pe" />);

    expect(screen.getByRole("link", { name: "Historial de viajes" })).toHaveAttribute(
      "href",
      "/viajes?tab=historial",
    );
  });
});

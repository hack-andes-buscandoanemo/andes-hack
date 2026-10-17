import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const signOut = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: (...args: unknown[]) => signOut(...args) },
}));

import Dashboard from "./dashboard";

beforeEach(() => {
  push.mockClear();
  signOut.mockReset();
});

describe("inicio", () => {
  it("greets the member in Spanish", () => {
    render(<Dashboard name="Ana" />);

    expect(screen.getByRole("heading", { level: 1, name: "Inicio" })).toBeInTheDocument();
    expect(screen.getByText("Hola, Ana")).toBeInTheDocument();
  });

  it("signs out and returns to the welcome screen", async () => {
    signOut.mockResolvedValue({});
    render(<Dashboard name="Ana" />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(signOut).toHaveBeenCalled();
  });
});

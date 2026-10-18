import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { deleteMe } = vi.hoisted(() => ({ deleteMe: vi.fn() }));

vi.mock("@/lib/communities-api", () => ({ communitiesApi: { deleteMe } }));

import PrivacySettings from "./privacy-settings";

beforeEach(() => deleteMe.mockReset());
afterEach(cleanup);

describe("privacy settings", () => {
  it("requires confirmation and shows the deletion date on success", async () => {
    deleteMe.mockResolvedValue({
      message: "Tus datos fueron eliminados.",
      deletedAt: "2026-10-18T12:00:00.000Z",
    });
    const user = userEvent.setup();
    render(<PrivacySettings />);

    await user.click(screen.getByRole("button", { name: "Eliminar mis datos" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Esta acción no se puede deshacer.");
    await user.click(screen.getByRole("button", { name: "Confirmar eliminación" }));

    expect(deleteMe).toHaveBeenCalledOnce();
    expect(await screen.findByText("Tus datos fueron eliminados.")).toBeInTheDocument();
    expect(screen.getByText(/18 de octubre de 2026/)).toBeInTheDocument();
  });
});

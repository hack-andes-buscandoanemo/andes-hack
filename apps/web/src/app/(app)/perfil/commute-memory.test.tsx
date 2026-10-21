import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { httpClient } from "@/lib/http-client";
import { serverError } from "@/test/server-error";

import CommuteMemory from "./commute-memory";

const originalAdapter = httpClient.defaults.adapter;
const commuteMemory = vi.fn();

beforeEach(() => {
  httpClient.defaults.adapter = async (config) => {
    if (config.url !== "/me/commute-memory") throw new Error(`Unexpected request: ${config.url}`);
    const data = await commuteMemory(config.method);
    return { data, status: 200, statusText: "OK", headers: {}, config };
  };
  commuteMemory.mockReset();
});

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
});

describe("perfil: horario recordado (Atomic Memory)", () => {
  it("shows the remembered window and forgets it on request", async () => {
    commuteMemory.mockImplementation(async (method: string) =>
      method === "delete"
        ? { message: "Olvidamos tu horario." }
        : { enabled: true, window: { windowStart: "06:45", windowEnd: "07:30" } },
    );
    const user = userEvent.setup();
    render(<CommuteMemory />);

    expect(await screen.findByText("6:45 a. m. a 7:30 a. m.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Olvidar horario" }));

    expect(commuteMemory).toHaveBeenCalledWith("delete");
    expect(await screen.findByText("Olvidamos tu horario.")).toBeInTheDocument();
    expect(screen.queryByText("6:45 a. m. a 7:30 a. m.")).toBeNull();
  });

  it("keeps showing the window when it could not be forgotten", async () => {
    commuteMemory.mockImplementation(async (method: string) => {
      if (method !== "delete") {
        return { enabled: true, window: { windowStart: "06:45", windowEnd: "07:30" } };
      }
      throw serverError(
        502,
        "No se borró tu horario: Atomic Memory no respondió. Inténtalo de nuevo.",
      );
    });
    const user = userEvent.setup();
    render(<CommuteMemory />);

    await user.click(await screen.findByRole("button", { name: "Olvidar horario" }));

    expect(
      await screen.findByText(
        "No se borró tu horario: Atomic Memory no respondió. Inténtalo de nuevo.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("6:45 a. m. a 7:30 a. m.")).toBeInTheDocument();
  });

  it("is not shown when the server has no Atomic Memory", async () => {
    commuteMemory.mockResolvedValue({ enabled: false, window: null });
    const { container } = render(<CommuteMemory />);

    await vi.waitFor(() => expect(commuteMemory).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

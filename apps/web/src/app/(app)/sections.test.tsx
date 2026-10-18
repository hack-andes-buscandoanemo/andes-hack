import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const listMyChats = vi.hoisted(() => vi.fn());

vi.mock("@/lib/communities-api", () => ({ communitiesApi: { listMyChats } }));

import ChatPage from "./chat/page";

describe.each([
  ["Chat", ChatPage, "Aún no tienes conversaciones. Aparecerán cuando aceptes un viaje."],
])("%s section", (title, Page, empty) => {
  beforeEach(() => listMyChats.mockReset().mockResolvedValue({ chats: [] }));
  afterEach(cleanup);

  it("renders a title and a clear empty state, never a broken page", async () => {
    render(<Page />);

    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(await screen.findByText(empty)).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ChatPage from "./chat/page";
import ViajesPage from "./viajes/page";

describe.each([
  ["Viajes", ViajesPage, "Aún no tienes viajes. Busca uno o publica el que ya haces."],
  ["Chat", ChatPage, "Aún no tienes conversaciones. Aparecerán cuando aceptes un viaje."],
])("%s section", (title, Page, empty) => {
  it("renders a title and a clear empty state, never a broken page", () => {
    render(<Page />);

    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText(empty)).toBeInTheDocument();
  });
});

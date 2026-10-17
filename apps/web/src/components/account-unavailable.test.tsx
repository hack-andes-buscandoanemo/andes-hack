import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AccountUnavailable from "./account-unavailable";

describe("account unavailable", () => {
  it("explains the problem and offers a retry instead of crashing", () => {
    render(<AccountUnavailable />);

    expect(
      screen.getByText("No pudimos cargar tu cuenta. Inténtalo de nuevo en unos minutos."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reintentar" })).toHaveAttribute("href", "/inicio");
  });
});

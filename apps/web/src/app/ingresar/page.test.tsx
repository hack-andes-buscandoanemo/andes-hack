import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import EnterPage from "./page";

describe("enter page", () => {
  it("offers to create an account or sign in", () => {
    render(<EnterPage />);

    expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute(
      "href",
      "/crear-cuenta",
    );
    expect(screen.getByRole("link", { name: "Ya tengo una cuenta" })).toHaveAttribute(
      "href",
      "/iniciar-sesion",
    );
  });
});

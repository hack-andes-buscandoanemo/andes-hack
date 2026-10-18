import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CancelTripDialog } from "./cancel-trip-dialog";

describe("CancelTripDialog", () => {
  it("renders when open with default title, reasons and action buttons", () => {
    render(<CancelTripDialog isOpen={true} onConfirm={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("¿Cancelar este viaje?")).toBeInTheDocument();
    expect(screen.getByLabelText("Cambié de horario")).toBeInTheDocument();
    expect(screen.getByLabelText("No iré a la sede")).toBeInTheDocument();
    expect(screen.getByLabelText("Otro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sí, cancelar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver" })).toBeInTheDocument();
  });

  it("calls onConfirm with selected reason when confirmed", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(<CancelTripDialog isOpen={true} onConfirm={onConfirm} onDismiss={vi.fn()} />);

    await user.click(screen.getByLabelText("Cambié de horario"));
    await user.click(screen.getByRole("button", { name: "Sí, cancelar" }));

    expect(onConfirm).toHaveBeenCalledWith("Cambié de horario");
  });

  it("calls onDismiss when Volver is clicked", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();

    render(<CancelTripDialog isOpen={true} onConfirm={vi.fn()} onDismiss={onDismiss} />);

    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("displays late cancellation warning when isLate is true", () => {
    render(
      <CancelTripDialog isOpen={true} isLate={true} onConfirm={vi.fn()} onDismiss={vi.fn()} />,
    );

    expect(screen.getByText(/menos de 1 hora de anticipación/i)).toBeInTheDocument();
  });
});

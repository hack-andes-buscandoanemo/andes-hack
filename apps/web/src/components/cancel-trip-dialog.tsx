"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export const CANCEL_REASONS = ["Cambié de horario", "No iré a la sede", "Otro"] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number];

export function CancelTripDialog({
  isOpen,
  title = "¿Cancelar este viaje?",
  isLate = false,
  submitting = false,
  onConfirm,
  onDismiss,
}: {
  isOpen: boolean;
  title?: string;
  isLate?: boolean;
  submitting?: boolean;
  onConfirm: (reason: string | null) => Promise<void> | void;
  onDismiss: () => void;
}) {
  const [selectedReason, setSelectedReason] = useState<CancelReason | null>(null);

  if (!isOpen) return null;

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-trip-title"
      className="space-y-4 surface p-5 shadow-md"
    >
      <h2 id="cancel-trip-title" className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">
        Indica el motivo de la cancelación (opcional):
      </p>

      <div className="space-y-2">
        {CANCEL_REASONS.map((reason) => (
          <label
            key={reason}
            className="flex items-center gap-2 text-sm font-medium cursor-pointer"
          >
            <input
              type="radio"
              name="cancelReason"
              value={reason}
              checked={selectedReason === reason}
              onChange={() => setSelectedReason(reason)}
              className="accent-primary"
            />
            {reason}
          </label>
        ))}
      </div>

      {isLate ? (
        <div
          role="status"
          className="rounded-xl border border-warning/30 bg-warning-surface p-3 text-sm text-warning"
        >
          <p className="font-semibold">Aviso de cancelación de último minuto</p>
          <p>
            Esta cancelación se realiza con menos de 1 hora de anticipación. Procura avisar con más
            tiempo para que los demás puedan organizarse.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button
          type="button"
          variant="destructive"
          disabled={submitting}
          onClick={() => void onConfirm(selectedReason)}
          className="font-bold"
        >
          {submitting ? "Cancelando…" : "Sí, cancelar"}
        </Button>
        <Button type="button" variant="outline" disabled={submitting} onClick={onDismiss}>
          Volver
        </Button>
      </div>
    </section>
  );
}

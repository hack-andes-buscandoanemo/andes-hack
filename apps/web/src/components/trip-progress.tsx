"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { reasonOf } from "@/lib/api-error";
import { communitiesApi, type MyTrip } from "@/lib/communities-api";

// The day-of-trip buttons for one accepted seat (US-025). The server decides what is allowed.
export default function TripProgress({ trip }: { trip: MyTrip }) {
  const [started, setStarted] = useState(trip.progress === "in_progress");
  const [arrival, setArrival] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(reasonOf(failure, "No pudimos actualizar el viaje. Inténtalo de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  if (trip.role === "driver") {
    return (
      <div className="flex flex-col gap-2">
        {started ? <p role="status">Viaje en curso</p> : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        {started ? null : (
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await communitiesApi.startTrip(trip.offerId);
                setStarted(true);
              })
            }
          >
            Iniciar viaje
          </Button>
        )}
      </div>
    );
  }

  if (arrival) return <p role="status">{arrival}</p>;

  return (
    <div className="flex flex-col gap-2">
      {started ? <p role="status">Viaje en curso</p> : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {started ? null : (
        <Button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await communitiesApi.boardBooking(trip.id);
              setStarted(true);
            })
          }
        >
          Ya estoy en el auto
        </Button>
      )}
      <Button
        type="button"
        disabled={!started || busy}
        onClick={() =>
          void run(async () => {
            const { message } = await communitiesApi.arriveBooking(trip.id);
            setArrival(message);
          })
        }
      >
        Llegué bien
      </Button>
    </div>
  );
}

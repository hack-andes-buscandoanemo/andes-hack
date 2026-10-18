"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { reasonOf } from "@/lib/api-error";
import { communitiesApi, type MyTrip } from "@/lib/communities-api";

const ARRIVED_MESSAGE = "Llegada confirmada. ¡Gracias por compartir el viaje!";

// Preview the server's Lima calendar window, including trips shortly after midnight.
function startOpen(trip: MyTrip, now: Date) {
  const today = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return [0, 1].some((offset) => {
    const day = new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000);
    const date = day.toISOString().slice(0, 10);
    if (trip.date ? trip.date !== date : !trip.daysOfWeek?.includes(day.getUTCDay() || 7))
      return false;
    const departure = Date.parse(`${date}T${trip.time}-05:00`);
    const end = Date.parse(`${date}T00:00:00-05:00`) + 86_400_000;
    return now.getTime() >= departure - 30 * 60_000 && now.getTime() < end;
  });
}

// What the person reads while the trip is under way, or why the last tap failed.
function Feedback({ started, error }: { started: boolean; error: string | null }) {
  return (
    <>
      {started ? <p role="status">Viaje en curso</p> : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}

// The day-of-trip buttons for one accepted seat (US-025). The server decides what is allowed
// and everything shown here comes from its answer, never from the tap itself.
export default function TripProgress({ trip }: { trip: MyTrip }) {
  const [started, setStarted] = useState(trip.progress === "in_progress");
  const [arrival, setArrival] = useState<string | null>(
    trip.progress === "arrived" ? ARRIVED_MESSAGE : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  // State updates after the render, so two taps in the same tick would both pass `busy`.
  const running = useRef(false);

  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(reasonOf(failure, "No pudimos actualizar el viaje. Inténtalo de nuevo."));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  if (trip.role === "driver") {
    return (
      <div className="flex flex-col gap-2">
        <Feedback started={started} error={error} />
        {started ? null : (
          <Button
            type="button"
            disabled={busy}
            aria-disabled={!startOpen(trip, now) || busy}
            onClick={() => {
              if (!startOpen(trip, now)) return;
              void run(async () => {
                const { boarded } = await communitiesApi.startTrip(trip.offerId);
                setStarted(boarded > 0);
              });
            }}
          >
            Iniciar viaje
          </Button>
        )}
        {!started && !startOpen(trip, now) ? (
          <p className="text-sm text-muted-foreground">
            Podrás iniciar el viaje 30 minutos antes de la salida.
          </p>
        ) : null}
      </div>
    );
  }

  if (arrival) return <p role="status">{arrival}</p>;

  return (
    <div className="flex flex-col gap-2">
      <Feedback started={started} error={error} />
      {started ? null : (
        <Button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const { booking } = await communitiesApi.boardBooking(trip.id);
              setStarted(booking.startedAt !== null);
            })
          }
        >
          Ya estoy en el auto
        </Button>
      )}
      <Button
        type="button"
        aria-disabled={!started || busy}
        onClick={() => {
          if (!started) return;
          void run(async () => {
            const { message } = await communitiesApi.arriveBooking(trip.id);
            setArrival(message);
          });
        }}
      >
        Llegué bien
      </Button>
      {started ? null : (
        <p className="text-sm text-muted-foreground">Disponible cuando el viaje haya iniciado.</p>
      )}
    </div>
  );
}

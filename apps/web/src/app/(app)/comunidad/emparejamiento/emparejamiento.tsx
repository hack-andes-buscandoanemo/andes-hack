"use client";

import { isAxiosError } from "axios";
import { useEffect, useState } from "react";

import EmptyState from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { communitiesApi, type MatchRunsResponse } from "@/lib/communities-api";

import { clockLabel, dateLabel, limaToday } from "../../buscar/schedule";

const selectClass = "h-9 rounded-lg border border-input bg-background px-2 text-sm font-normal";

// The server answers in Spanish ("Ya hay un emparejamiento en curso…"); fall back when it does not.
function reasonOf(failure: unknown, fallback: string) {
  const reason = isAxiosError(failure) ? failure.response?.data?.error : undefined;
  return typeof reason === "string" ? reason : fallback;
}

function strategyLine(name: string, run: MatchRunsResponse["optimizer"]) {
  return `${name}: ${run.carTripsAvoided} viajes en auto evitados · ${run.passengersMatched} pasajeros · ${run.detourMinutes} min de desvío total`;
}

export default function Emparejamiento({ communityId }: { communityId: string }) {
  const [direction, setDirection] = useState<"outbound" | "return">("outbound");
  const [date, setDate] = useState(limaToday());
  const [result, setResult] = useState<MatchRunsResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The last journey run, so the panel is not empty when the admin comes back.
  useEffect(() => {
    let active = true;
    communitiesApi
      .latestMatchRuns(communityId)
      .then((latest) => {
        if (active) setResult(latest);
      })
      .catch(() => {
        // Nothing run yet, or the server is down: the admin can still run it now.
      });
    return () => {
      active = false;
    };
  }, [communityId]);

  async function run() {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      setResult(await communitiesApi.runMatching(communityId, { direction, date }));
    } catch (failure) {
      setError(reasonOf(failure, "No pudimos ejecutar el emparejamiento. Inténtalo de nuevo."));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="flex flex-col gap-4 px-4 py-4">
      <header>
        <h1 className="text-3xl font-extrabold">Emparejamiento</h1>
        <p className="text-muted-foreground">
          Llena los asientos de una jornada. Cada conductor sigue decidiendo a quién acepta.
        </p>
      </header>
      <form
        className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <label className="flex items-center justify-between gap-3 text-sm font-bold">
          Dirección
          <select
            className={selectClass}
            value={direction}
            onChange={(event) => setDirection(event.target.value as "outbound" | "return")}
          >
            <option value="outbound">Ida</option>
            <option value="return">Regreso</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-3 text-sm font-bold">
          Fecha
          <input
            type="date"
            className={selectClass}
            value={date}
            required
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={running} className="h-11 w-full rounded-xl font-bold">
          Ejecutar emparejamiento
        </Button>
        {running ? (
          <p role="status" className="text-sm text-muted-foreground">
            Calculando emparejamiento…
          </p>
        ) : null}
      </form>

      {result ? (
        <section aria-labelledby="result" className="flex flex-col gap-3">
          <h2 id="result" className="text-lg font-bold">
            {`${result.direction === "outbound" ? "Ida" : "Regreso"} · ${dateLabel(result.date)}`}
          </h2>
          <div className="flex flex-col gap-2 rounded-2xl bg-brand-yellow/15 p-3 text-sm">
            <p className="font-medium">{strategyLine("Optimizador", result.optimizer)}</p>
            <p className="text-muted-foreground">
              {strategyLine("Primero en llegar", result.firstComeFirstServed)}
            </p>
            <p className="text-xs text-muted-foreground">
              {`${result.optimizer.offers} ofertas · ${result.optimizer.requests} necesidades · ${result.optimizer.unassigned} sin asiento`}
            </p>
          </div>
          <h3 id="suggestions" className="font-bold">
            Asignaciones recomendadas
          </h3>
          {result.suggestions.length === 0 ? (
            <EmptyState>Ningún pasajero cabe en las ofertas de esta jornada.</EmptyState>
          ) : (
            <ul aria-labelledby="suggestions" className="flex flex-col gap-2">
              {result.suggestions.map((suggestion) => (
                <li
                  key={suggestion.id}
                  className="flex flex-col gap-0.5 rounded-2xl border bg-card p-3 text-sm shadow-sm"
                >
                  <p className="font-bold">{`${suggestion.passengerName} → viaje de ${suggestion.driverName}`}</p>
                  <p>{suggestion.meetingPointName}</p>
                  <p className="text-muted-foreground">
                    {`Recogida ${clockLabel(suggestion.pickupAt)} · Llegada ${clockLabel(suggestion.arrivalAt)}`}
                  </p>
                  <p className="text-muted-foreground">
                    {`Desvío ${suggestion.detourMinutes} min · Caminata ${suggestion.walkMinutes} min`}
                  </p>
                  {suggestion.avoidsCarTrip ? (
                    <p className="w-fit rounded-full bg-brand-yellow px-2.5 py-0.5 text-xs font-bold text-brand-black">
                      Evita un viaje en auto
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </main>
  );
}

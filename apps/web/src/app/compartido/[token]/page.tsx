"use client";

import { isAxiosError } from "axios";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { clockLabel } from "@/app/(app)/buscar/schedule";
import { communitiesApi, type SharedTrip } from "@/lib/communities-api";

const STATUS_LABEL = {
  not_started: "Por iniciar",
  in_progress: "En curso",
  arrived: "Llegó bien",
} as const;

// What someone with a shared link sees (US-028): public, no account, nothing beyond the trip.
export default function SharedTripPage() {
  const { token } = useParams<{ token: string }>();
  const [trip, setTrip] = useState<SharedTrip | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setTrip(null);
    setProblem(null);
    communitiesApi
      .getSharedTrip(token)
      .then((loaded) => {
        if (active) setTrip(loaded);
      })
      .catch((failure: unknown) => {
        if (!active) return;
        const status = isAxiosError(failure) ? failure.response?.status : undefined;
        setProblem(
          status === 404 || status === 422
            ? "Este enlace ya no está disponible."
            : status === 429
              ? "Demasiados intentos. Inténtalo en un momento."
              : "No pudimos cargar este viaje. Inténtalo de nuevo.",
        );
      });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-4 py-6">
      {problem ? (
        <p role="alert" className="rounded-2xl border bg-card p-5 text-sm font-medium">
          {problem}
        </p>
      ) : trip ? (
        <>
          <h1 className="text-2xl font-bold">{`${trip.passengerAlias} comparte su viaje contigo`}</h1>
          <p className="w-fit rounded-full bg-brand-yellow px-3 py-1 text-sm font-semibold text-brand-black">
            {STATUS_LABEL[trip.status]}
          </p>
          <section className="space-y-1 rounded-2xl border bg-card p-5 text-sm shadow-sm">
            <p>{`Conductor: ${trip.driverAlias}`}</p>
            <p>{`Vehículo: ${trip.vehicle.make} ${trip.vehicle.model} ${trip.vehicle.color.toLowerCase()}`}</p>
            <p>{`Placa: ${trip.vehicle.plate}`}</p>
            <p>{`Punto de encuentro: ${trip.meetingPointName}`}</p>
            <p>{`Hora estimada: ${clockLabel(trip.estimatedTime)}`}</p>
          </section>
        </>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Cargando viaje…
        </p>
      )}
    </main>
  );
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import EmptyState from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { communitiesApi, type MyTrip } from "@/lib/communities-api";

import { clockLabel, dateLabel, daysLabel } from "../buscar/schedule";

const STATUS_LABELS: Record<MyTrip["status"], string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  completed: "Completada",
  no_show: "No se presentó",
  paused: "Pausado",
  active: "Activo",
};

function TripCard({ trip, onToggle }: { trip: MyTrip; onToggle: (trip: MyTrip) => void }) {
  const outbound = trip.direction === "outbound";
  const from = outbound ? trip.originZoneName : trip.destinationName;
  const to = outbound ? trip.destinationName : trip.originZoneName;
  return (
    <li className="flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold">{outbound ? "Ida" : "Regreso"}</span>
        <span className="rounded-full bg-brand-yellow px-2.5 py-0.5 text-xs font-bold text-brand-black">
          {STATUS_LABELS[trip.status]}
        </span>
      </div>
      <p className="text-sm font-semibold">{`${from} → ${to}`}</p>
      <p className="flex gap-4 text-sm">
        <span>{trip.date ? dateLabel(trip.date) : daysLabel(trip.daysOfWeek ?? [])}</span>
        <span>{clockLabel(trip.time.slice(0, 5))}</span>
      </p>
      {trip.meetingPointName ? (
        <p className="text-xs text-muted-foreground">
          {`Punto de encuentro: ${trip.meetingPointName}`}
        </p>
      ) : null}
      {trip.driver ? (
        <p className="text-sm">
          <span className="font-bold">{trip.driver.alias}</span>
          {trip.driver.plate ? <span className="ml-3">{`Placa: ${trip.driver.plate}`}</span> : null}
        </p>
      ) : null}
      {trip.pendingRequests !== null ? (
        <p className="text-sm">
          {trip.pendingRequests === 1
            ? "1 solicitud pendiente"
            : `${trip.pendingRequests} solicitudes pendientes`}
        </p>
      ) : null}
      {trip.acceptedPassengers?.length ? (
        <p className="text-sm">{`Pasajeros: ${trip.acceptedPassengers.join(", ")}`}</p>
      ) : null}
      <Link href={`/viajes/${trip.offerId}`} className="w-fit text-sm font-bold underline">
        Ver viaje
      </Link>
      {trip.role === "driver" && (trip.status === "active" || trip.status === "paused") ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onToggle(trip)}>
          {trip.status === "paused" ? "Reactivar" : "Pausar"}
        </Button>
      ) : null}
    </li>
  );
}

export default function Viajes() {
  const searchParams = useSearchParams();
  const [trips, setTrips] = useState<MyTrip[] | null>(null);
  const [role, setRole] = useState<"passenger" | "driver">("passenger");
  const [scope, setScope] = useState<"upcoming" | "past">(
    searchParams?.get("tab") === "historial" ? "past" : "upcoming",
  );
  const [failed, setFailed] = useState(false);
  const [toggleFailed, setToggleFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setTrips(null);
    communitiesApi
      .listMyTrips(role, scope)
      .then((response) => {
        if (active) setTrips(response.trips);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [role, scope, attempt]);

  async function toggle(trip: MyTrip) {
    const status = trip.status === "paused" ? "active" : "paused";
    setToggleFailed(false);
    try {
      await communitiesApi.updateOfferStatus(trip.offerId, status);
    } catch {
      setToggleFailed(true);
      return;
    }
    setTrips(
      (current) =>
        current?.map((item) => (item.id === trip.id ? { ...item, status } : item)) ?? null,
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
      <h1 className="text-3xl font-extrabold">Viajes</h1>
      <div role="tablist" aria-label="Periodo" className="grid grid-cols-2 gap-2">
        {(
          [
            ["upcoming", "Próximos"],
            ["past", "Historial"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            role="tab"
            aria-selected={scope === value}
            variant={scope === value ? "default" : "outline"}
            onClick={() => setScope(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        {(
          [
            ["passenger", "Como pasajero"],
            ["driver", "Como conductor"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            aria-pressed={role === value}
            variant={role === value ? "secondary" : "outline"}
            onClick={() => setRole(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      {toggleFailed ? (
        <p role="alert" className="text-sm text-destructive">
          No pudimos actualizar el viaje. Inténtalo de nuevo.
        </p>
      ) : null}
      {failed ? (
        <div role="alert" className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
          <p>No pudimos cargar tus viajes.</p>
          <Button type="button" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      ) : trips === null ? (
        <p role="status" className="text-muted-foreground">
          Cargando viajes…
        </p>
      ) : trips.length === 0 ? (
        <EmptyState>Aún no tienes viajes. Busca uno o publica el que ya haces.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} onToggle={toggle} />
          ))}
        </ul>
      )}
    </main>
  );
}

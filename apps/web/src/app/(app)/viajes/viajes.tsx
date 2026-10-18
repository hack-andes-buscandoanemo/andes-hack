"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import EmptyState from "@/components/empty-state";
import { pairReturns, type PairedReturn } from "@/components/return-pairs";
import ReturnTripCard from "@/components/return-trip-card";
import { FUEL_NOTE, FuelShareLine } from "@/components/fuel-estimate";
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

function TripCard({
  trip,
  busy,
  onToggle,
  coordinateReturn,
  returns,
}: {
  trip: MyTrip;
  busy: boolean;
  onToggle: (trip: MyTrip) => void;
  coordinateReturn: boolean;
  returns: PairedReturn[];
}) {
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
      {trip.seatsTotal !== null && trip.seatsFree !== null ? (
        <p className="text-sm">{`${trip.seatsFree} de ${trip.seatsTotal} asientos libres`}</p>
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
      <FuelShareLine estimate={trip.fuelEstimate} />
      <Link href={`/viajes/${trip.offerId}`} className="w-fit text-sm font-bold underline">
        Ver viaje
      </Link>
      {trip.role === "driver" && (trip.status === "active" || trip.status === "paused") ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => onToggle(trip)}
        >
          {trip.status === "paused" ? "Reactivar" : "Pausar"}
        </Button>
      ) : null}
      {coordinateReturn ? <ReturnTripCard trip={trip} returns={returns} /> : null}
    </li>
  );
}

export default function Viajes() {
  const searchParams = useSearchParams();
  const [trips, setTrips] = useState<MyTrip[] | null>(null);
  const roleParam = searchParams?.get("role");
  const linkedRole =
    roleParam === "conductor" ? "driver" : roleParam === "pasajero" ? "passenger" : null;
  const [role, setRole] = useState<"passenger" | "driver">(linkedRole ?? "passenger");
  // The smart default (driver view when only that has trips) applies once, before the person chooses.
  const decided = useRef(linkedRole !== null);
  const tabParam = searchParams?.get("tab");
  const [scope, setScope] = useState<"upcoming" | "past">(
    tabParam === "historial" ? "past" : "upcoming",
  );
  // The Perfil link can change the param while this screen is already open.
  useEffect(() => {
    setScope(tabParam === "historial" ? "past" : "upcoming");
  }, [tabParam]);
  const [failed, setFailed] = useState(false);
  const [toggleFailed, setToggleFailed] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setTrips(null);
    (async () => {
      const response = await communitiesApi.listMyTrips(role, scope);
      if (!decided.current && role === "passenger" && scope === "upcoming") {
        decided.current = true;
        if (response.trips.length === 0) {
          const asDriver = await communitiesApi.listMyTrips("driver", scope);
          if (asDriver.trips.length > 0) {
            if (active) setRole("driver");
            return;
          }
        }
      }
      if (active) setTrips(response.trips);
    })().catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [role, scope, attempt]);

  // Pair outbound and return once per list, not once per card.
  const returnsByTrip = useMemo(() => pairReturns(trips ?? []), [trips]);

  async function toggle(trip: MyTrip) {
    if (togglingId) return;
    setToggleFailed(false);
    setTogglingId(trip.id);
    try {
      // Show what the server saved, not what we asked for.
      const saved = await communitiesApi.updateOfferStatus(
        trip.offerId,
        trip.status === "paused" ? "active" : "paused",
      );
      setTrips(
        (current) =>
          current?.map((item) =>
            item.id === trip.id ? { ...item, status: saved.status } : item,
          ) ?? null,
      );
    } catch {
      setToggleFailed(true);
    } finally {
      setTogglingId(null);
    }
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
            id={`trips-tab-${value}`}
            aria-controls="trips-panel"
            aria-selected={scope === value}
            tabIndex={scope === value ? 0 : -1}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              decided.current = true;
              setScope(value === "upcoming" ? "past" : "upcoming");
              document
                .getElementById(`trips-tab-${value === "upcoming" ? "past" : "upcoming"}`)
                ?.focus();
            }}
            variant={scope === value ? "default" : "outline"}
            onClick={() => {
              decided.current = true;
              setScope(value);
            }}
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
            onClick={() => {
              decided.current = true;
              setRole(value);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="trips-panel"
        aria-labelledby={`trips-tab-${scope}`}
        className="flex flex-col gap-4"
      >
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
          <>
            <ul className="space-y-3">
              {trips.map((trip) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  busy={togglingId === trip.id}
                  onToggle={toggle}
                  coordinateReturn={scope === "upcoming"}
                  returns={returnsByTrip.get(trip.id) ?? []}
                />
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{FUEL_NOTE}</p>
          </>
        )}
      </div>
    </main>
  );
}

import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import type { ReactNode } from "react";

import { clockLabel, dateLabel, daysLabel } from "@/app/(app)/buscar/schedule";
import { FuelShareLine } from "@/components/fuel-estimate";
import type { MyTrip } from "@/lib/communities-api";

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

// Status reads by tone: waiting is yellow, settled is neutral, problems are red.
const STATUS_TONES: Record<MyTrip["status"], string> = {
  pending: "bg-brand-yellow text-brand-black",
  accepted: "bg-success/15 text-success",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-secondary text-muted-foreground",
  completed: "bg-secondary text-secondary-foreground",
  no_show: "bg-destructive/10 text-destructive",
  paused: "bg-secondary text-muted-foreground",
  active: "bg-success/15 text-success",
};

// One trip, as Viajes and Inicio both show it; `children` adds that screen's actions.
export default function TripSummaryCard({
  trip,
  children,
}: {
  trip: MyTrip;
  children?: ReactNode;
}) {
  const outbound = trip.direction === "outbound";
  const from = outbound ? trip.originZoneName : trip.destinationName;
  const to = outbound ? trip.destinationName : trip.originZoneName;
  return (
    <article
      aria-label={`${outbound ? "Ida" : "Regreso"} · ${from} → ${to}`}
      className="flex flex-col gap-3 surface p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {outbound ? "Ida" : "Regreso"}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONES[trip.status]}`}
        >
          {STATUS_LABELS[trip.status]}
        </span>
      </div>
      <div className="space-y-1">
        <p className="text-[0.9375rem] font-semibold">{`${from} → ${to}`}</p>
        <p className="flex gap-4 text-sm text-muted-foreground tabular-nums">
          <span>{trip.date ? dateLabel(trip.date) : daysLabel(trip.daysOfWeek ?? [])}</span>
          <span className="font-medium text-foreground">{clockLabel(trip.time.slice(0, 5))}</span>
        </p>
      </div>
      {trip.meetingPointName ? (
        <p className="text-[0.8125rem] text-muted-foreground">
          {`Punto de encuentro: ${trip.meetingPointName}`}
        </p>
      ) : null}
      {trip.driver ? (
        <p className="text-sm">
          <span className="font-semibold">{trip.driver.alias}</span>
          {trip.driver.plate ? (
            <span className="ml-3 text-muted-foreground">{`Placa: ${trip.driver.plate}`}</span>
          ) : null}
        </p>
      ) : null}
      {trip.seatsTotal !== null && trip.seatsFree !== null ? (
        <p className="text-sm">{`${trip.seatsFree} de ${trip.seatsTotal} asientos libres`}</p>
      ) : null}
      {trip.pendingRequests !== null ? (
        <p className="text-sm font-medium">
          {trip.pendingRequests === 1
            ? "1 solicitud pendiente"
            : `${trip.pendingRequests} solicitudes pendientes`}
        </p>
      ) : null}
      {trip.acceptedPassengers?.length ? (
        <p className="text-sm">{`Pasajeros: ${trip.acceptedPassengers.join(", ")}`}</p>
      ) : null}
      <FuelShareLine estimate={trip.fuelEstimate} />
      <Link
        href={`/viajes/${trip.offerId}`}
        className="inline-flex w-fit items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline"
      >
        Ver viaje
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" aria-hidden />
      </Link>
      {children}
    </article>
  );
}

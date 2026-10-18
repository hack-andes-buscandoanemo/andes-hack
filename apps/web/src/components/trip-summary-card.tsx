import Link from "next/link";
import type { ReactNode } from "react";

import { clockLabel, dateLabel, daysLabel } from "@/app/(app)/buscar/schedule";
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
      className="flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-sm"
    >
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
      <Link href={`/viajes/${trip.offerId}`} className="w-fit text-sm font-bold underline">
        Ver viaje
      </Link>
      {children}
    </article>
  );
}

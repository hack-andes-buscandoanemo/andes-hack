import Link from "next/link";

import { FuelShareLine } from "@/components/fuel-estimate";
import type { TripMatch } from "@/lib/communities-api";

import { clockLabel } from "./schedule";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

export default function TripCard({
  match,
  communityName,
  best,
}: {
  match: TripMatch;
  communityName: string;
  best: boolean;
}) {
  const outbound = match.direction === "outbound";
  const from = outbound ? match.originZoneName : match.destinationName;
  const to = outbound ? match.destinationName : match.originZoneName;
  return (
    <li className="flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-sm">
      {best ? (
        <span className="w-fit rounded-full bg-brand-yellow px-2.5 py-0.5 text-xs font-bold text-brand-black">
          Mejor coincidencia
        </span>
      ) : null}
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-black text-sm font-bold text-white"
        >
          {initialsOf(match.driverName)}
        </span>
        <div className="min-w-0">
          <p className="font-bold">{match.driverName}</p>
          <p className="text-xs text-muted-foreground">{communityName}</p>
        </div>
      </div>
      <p className="text-sm font-semibold">{`${from} → ${to}`}</p>
      <p className="text-xs text-muted-foreground">
        {outbound ? "Punto de encuentro" : "Punto de bajada"}: {match.meetingPointName}
      </p>
      <p className="flex gap-4 text-sm">
        <span>{clockLabel(match.departureTime.slice(0, 5))}</span>
        <span>{match.seatsFree === 1 ? "1 asiento" : `${match.seatsFree} asientos`}</span>
      </p>
      <ul className="flex flex-wrap gap-2 text-xs font-medium">
        <li className="rounded-full bg-muted px-2.5 py-0.5">{`+${match.detourMinutes} min de desvío`}</li>
        <li className="rounded-full bg-muted px-2.5 py-0.5">{`${match.walkMinutes} min a pie`}</li>
        <li className="rounded-full bg-muted px-2.5 py-0.5">{`Llega ${match.arrivalAt}`}</li>
      </ul>
      <FuelShareLine estimate={match.fuelEstimate} />
      <Link href={`/viajes/${match.offerId}`} className="w-fit text-sm font-bold underline">
        Ver viaje
      </Link>
    </li>
  );
}

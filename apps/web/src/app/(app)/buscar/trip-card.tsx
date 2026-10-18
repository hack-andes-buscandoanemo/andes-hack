import Link from "next/link";
import type { Route } from "next";

import { FuelShareLine } from "@/components/fuel-estimate";
import { LiveBadge, TripPrice } from "@/components/trip-price";
import ProfileAvatar from "@/components/profile-avatar";
import type { TripMatch } from "@/lib/communities-api";

import { clockLabel } from "./schedule";

export default function TripCard({
  match,
  communityName,
  best,
  onMap = false,
  onShowMap,
}: {
  match: TripMatch;
  communityName: string;
  best: boolean;
  // This card's trip is the one drawn on the map above the list.
  onMap?: boolean;
  onShowMap?: () => void;
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
        <ProfileAvatar
          name={match.driverName}
          photoUrl={match.driverPhotoUrl}
          className="size-11"
        />
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
      {match.live ? <LiveBadge /> : null}
      <TripPrice priceCents={match.priceCents} paymentMethods={match.paymentMethods} />
      {match.dropOffMeters !== null ? (
        <p className="text-xs font-medium">
          {match.dropOffMeters < 1000
            ? `Te deja a ${match.dropOffMeters} m de tu destino`
            : `Te deja a ${(match.dropOffMeters / 1000).toFixed(1)} km de tu destino`}
        </p>
      ) : null}
      <FuelShareLine estimate={match.fuelEstimate} />
      {onShowMap ? (
        <button
          type="button"
          aria-pressed={onMap}
          onClick={onShowMap}
          className={`flex min-h-11 items-center justify-center rounded-xl border font-bold ${
            onMap ? "border-foreground bg-brand-yellow/20" : ""
          }`}
        >
          {onMap ? "Viendo en el mapa" : "Ver en el mapa"}
        </button>
      ) : null}
      <Link
        href={`/viajes/${match.offerId}` as Route}
        className="flex min-h-11 items-center justify-center rounded-xl border font-bold"
      >
        Ver viaje
      </Link>
    </li>
  );
}

import {
  Clock01Icon,
  Location01Icon,
  MapsLocation01Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import type { Route } from "next";

import { FuelShareLine } from "@/components/fuel-estimate";
import { LiveBadge, TripPrice } from "@/components/trip-price";
import ProfileAvatar from "@/components/profile-avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
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
    <li className={`flex flex-col gap-4 surface p-5 ${best ? "ring-2 ring-brand-yellow" : ""}`}>
      <div className="flex items-center gap-3">
        <ProfileAvatar
          name={match.driverName}
          photoUrl={match.driverPhotoUrl}
          className="size-11"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{match.driverName}</p>
          <p className="truncate text-[0.8125rem] text-muted-foreground">{communityName}</p>
        </div>
        {best ? (
          <span className="shrink-0 rounded-full bg-brand-yellow px-2.5 py-1 text-xs font-semibold text-brand-black">
            Mejor coincidencia
          </span>
        ) : null}
      </div>

      <div className="flex gap-3">
        <span aria-hidden className="flex w-4 shrink-0 flex-col items-center pt-1.5">
          <span className="size-2.5 rounded-full border-2 border-foreground" />
          <span className="my-1 w-px flex-1 bg-border" />
          <span className="size-2.5 rounded-full bg-foreground" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-[0.9375rem] font-semibold">{`${from} → ${to}`}</p>
          <p className="text-[0.8125rem] text-muted-foreground">
            {outbound ? "Punto de encuentro" : "Punto de bajada"}: {match.meetingPointName}
          </p>
        </div>
      </div>

      <p className="flex items-center gap-4 text-sm font-medium">
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <HugeiconsIcon icon={Clock01Icon} className="size-4 text-muted-foreground" aria-hidden />
          {clockLabel(match.departureTime.slice(0, 5))}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <HugeiconsIcon
            icon={UserMultipleIcon}
            className="size-4 text-muted-foreground"
            aria-hidden
          />
          {match.seatsFree === 1 ? "1 asiento" : `${match.seatsFree} asientos`}
        </span>
      </p>
      <ul className="flex flex-wrap gap-1.5 text-xs font-medium text-secondary-foreground">
        <li className="rounded-full bg-secondary px-2.5 py-1">{`+${match.detourMinutes} min de desvío`}</li>
        <li className="rounded-full bg-secondary px-2.5 py-1">{`${match.walkMinutes} min a pie`}</li>
        <li className="rounded-full bg-secondary px-2.5 py-1">{`Llega ${match.arrivalAt}`}</li>
      </ul>

      <div className="flex flex-col gap-1.5 border-t pt-4">
        {match.live ? <LiveBadge /> : null}
        <TripPrice priceCents={match.priceCents} paymentMethods={match.paymentMethods} />
        {match.dropOffMeters !== null ? (
          <p className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium">
            <HugeiconsIcon
              icon={Location01Icon}
              className="size-4 text-muted-foreground"
              aria-hidden
            />
            {match.dropOffMeters < 1000
              ? `Te deja a ${match.dropOffMeters} m de tu destino`
              : `Te deja a ${(match.dropOffMeters / 1000).toFixed(1)} km de tu destino`}
          </p>
        ) : null}
        <FuelShareLine estimate={match.fuelEstimate} />
      </div>
      {onShowMap ? (
        <Button
          type="button"
          variant="outline"
          aria-pressed={onMap}
          onClick={onShowMap}
          className="w-full"
        >
          <HugeiconsIcon icon={MapsLocation01Icon} className="size-4" aria-hidden />
          {onMap ? "Viendo en el mapa" : "Ver en el mapa"}
        </Button>
      ) : null}
      <Link
        href={`/viajes/${match.offerId}` as Route}
        onNavigate={() => trackEvent("Viaje seleccionado")}
        className={buttonVariants({ variant: best ? "default" : "outline", className: "w-full" })}
      >
        Ver viaje
      </Link>
    </li>
  );
}

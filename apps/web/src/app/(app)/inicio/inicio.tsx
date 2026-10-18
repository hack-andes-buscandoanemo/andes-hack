"use client";

import { Car01Icon, CheckmarkBadge01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/empty-state";
import { pairReturns } from "@/components/return-pairs";
import ReturnTripCard from "@/components/return-trip-card";
import TripSummaryCard from "@/components/trip-summary-card";
import { buttonVariants } from "@/components/ui/button";
import { communitiesApi, type MyTrip } from "@/lib/communities-api";

import Proposals from "./proposals";

const EMPTY_TRIPS = "Aún no tienes viajes. Busca uno o publica el que ya haces.";

// ponytail: matches (US-016) and impact (US-030) show empty states until built.
export default function Inicio({
  name,
  communityId,
  communityName,
}: {
  name: string;
  communityId?: string;
  communityName?: string;
}) {
  const [trips, setTrips] = useState<MyTrip[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    communitiesApi.listMyTrips("passenger", "upcoming").then(
      (response) => {
        if (active) setTrips(response.trips);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  // Pair outbound and return once per list, not once per card.
  const returnsByTrip = useMemo(() => pairReturns(trips ?? []), [trips]);

  return (
    <main className="flex flex-col gap-8 px-4 pt-2 pb-6">
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Hola, {name}</h1>
            <p className="mt-1 text-[0.9375rem] text-muted-foreground">¿A dónde vamos hoy?</p>
          </div>
          {communityName && (
            <p className="flex shrink-0 flex-col items-end gap-0.5 text-right text-[0.8125rem]">
              <span className="font-semibold">{communityName}</span>
              <span className="inline-flex items-center gap-1 font-medium text-success">
                <HugeiconsIcon icon={CheckmarkBadge01Icon} className="size-4" aria-hidden />
                Miembro verificado
              </span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Link href="/buscar" className={buttonVariants({ size: "lg" })}>
            <HugeiconsIcon icon={Search01Icon} className="size-5" aria-hidden />
            Buscar viaje
          </Link>
          <Link href="/ofrecer" className={buttonVariants({ size: "lg", variant: "inverse" })}>
            <HugeiconsIcon icon={Car01Icon} className="size-5" aria-hidden />
            Ofrecer viaje
          </Link>
        </div>
      </div>

      {communityId ? <Proposals communityId={communityId} /> : null}

      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          No pudimos cargar tus viajes.{" "}
          <Link href="/viajes" className="font-medium underline">
            Ver viajes
          </Link>
        </p>
      ) : trips === null ? (
        <div role="status" className="space-y-3">
          <span className="sr-only">Cargando viajes…</span>
          <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
          <div className="h-36 animate-pulse rounded-2xl bg-muted" />
        </div>
      ) : trips.length === 0 ? (
        <EmptyState tone="dark">{EMPTY_TRIPS}</EmptyState>
      ) : (
        <section aria-label="Tus próximos viajes" className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Tus próximos viajes</h2>
          {trips.map((trip) => (
            <TripSummaryCard key={trip.id} trip={trip}>
              <ReturnTripCard trip={trip} returns={returnsByTrip.get(trip.id) ?? []} />
            </TripSummaryCard>
          ))}
        </section>
      )}

      <section aria-labelledby="matches" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="matches" className="text-lg font-semibold tracking-tight">
            Coincidencias de hoy
          </h2>
          <Link
            href="/buscar"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline"
          >
            Ver todas
          </Link>
        </div>
        <EmptyState>Aún no hay coincidencias para hoy.</EmptyState>
      </section>

      <section aria-labelledby="impact" className="flex flex-col gap-3">
        <h2 id="impact" className="text-lg font-semibold tracking-tight">
          Tu impacto
        </h2>
        <EmptyState>Tu impacto aparecerá cuando completes tu primer viaje compartido.</EmptyState>
      </section>
    </main>
  );
}

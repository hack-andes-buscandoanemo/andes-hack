"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/empty-state";
import { pairReturns } from "@/components/return-pairs";
import ReturnTripCard from "@/components/return-trip-card";
import TripSummaryCard from "@/components/trip-summary-card";
import { communitiesApi, type MyTrip } from "@/lib/communities-api";

import Proposals from "./proposals";

const EMPTY_TRIPS = "Aún no tienes viajes. Busca uno o publica el que ya haces.";

// ponytail: matches (US-016) and impact (US-030) show empty states until built.
export default function Inicio({ name, communityId }: { name: string; communityId?: string }) {
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
    <main className="flex flex-col gap-5 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Hola, {name} 👋</h1>
          <p className="text-muted-foreground">¿A dónde vamos hoy?</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/buscar"
          className="flex min-h-12 items-center justify-center rounded-full bg-brand-yellow px-4 font-bold text-brand-black"
        >
          Buscar viaje
        </Link>
        <Link
          href="/ofrecer"
          className="flex min-h-12 items-center justify-center rounded-full bg-brand-black px-4 font-bold text-white"
        >
          Ofrecer viaje
        </Link>
      </div>

      {communityId ? <Proposals communityId={communityId} /> : null}

      {failed ? (
        <p role="alert">
          No pudimos cargar tus viajes.{" "}
          <Link href="/viajes" className="underline">
            Ver viajes
          </Link>
        </p>
      ) : trips === null ? (
        <p role="status">Cargando viajes…</p>
      ) : trips.length === 0 ? (
        <EmptyState tone="dark">{EMPTY_TRIPS}</EmptyState>
      ) : (
        <section aria-label="Tus próximos viajes" className="space-y-3">
          <h2 className="text-lg font-bold">Tus próximos viajes</h2>
          {trips.map((trip) => (
            <TripSummaryCard key={trip.id} trip={trip}>
              <ReturnTripCard trip={trip} returns={returnsByTrip.get(trip.id) ?? []} />
            </TripSummaryCard>
          ))}
        </section>
      )}

      <section aria-labelledby="matches" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 id="matches" className="text-lg font-bold">
            Coincidencias de hoy
          </h2>
          <Link href="/buscar" className="flex min-h-11 items-center font-medium underline">
            Ver todas
          </Link>
        </div>
        <EmptyState>Aún no hay coincidencias para hoy.</EmptyState>
      </section>

      <section
        aria-labelledby="impact"
        className="flex flex-col gap-2 rounded-2xl bg-brand-yellow/15 p-3"
      >
        <h2 id="impact" className="text-lg font-bold">
          Tu impacto
        </h2>
        <EmptyState>Tu impacto aparecerá cuando completes tu primer viaje compartido.</EmptyState>
      </section>
    </main>
  );
}

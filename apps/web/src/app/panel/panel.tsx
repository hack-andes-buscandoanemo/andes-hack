"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import EmptyState from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { communitiesApi, type CommunitySummary, type PublicStats } from "@/lib/communities-api";
import { kg } from "@/lib/format";

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div data-card className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-extrabold">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-lg font-bold">{value}</span>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `block-${title.replaceAll(" ", "-").toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <h2 id={id} className="text-lg font-extrabold">
        {title}
      </h2>
      {children}
    </section>
  );
}

// The server's clock, shown in Lima time whatever the visitor's device says.
const limaClock = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const REFRESH_MS = 30_000;

function Skeletons() {
  return (
    <div role="status" aria-label="Cargando el panel" className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-extrabold">Impacto en vivo</h1>
      {children}
    </main>
  );
}

export default function Panel() {
  const [communities, setCommunities] = useState<CommunitySummary[]>([]);
  const [communitiesLoaded, setCommunitiesLoaded] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // The communities come first; the first one in the list (Comunidad Alfa) opens by default.
  useEffect(() => {
    if (communities.length > 0) return;
    setFailed(false);
    communitiesApi.listCommunities().then(
      (list) => {
        setCommunities(list);
        setCommunitiesLoaded(true);
        setSlug((current) => current ?? list[0]?.slug ?? null);
      },
      () => setFailed(true),
    );
  }, [attempt, communities.length]);

  useEffect(() => {
    if (!slug) return;
    setFailed(false);
    let current = true;
    const showStats = (next: PublicStats) => {
      if (!current) return;
      setStats(next);
      setFailed(false);
    };
    // One request at a time: a slow answer is awaited, never overtaken by a second one.
    let inFlight = false;
    const load = (onError: () => void) => {
      inFlight = true;
      communitiesApi
        .getPublicStats(slug)
        .then(showStats, onError)
        .finally(() => (inFlight = false));
    };
    load(() => current && setFailed(true));
    // The server caches for 30 s, so asking more often would only repeat its answer. A
    // failed refresh keeps the figures on screen instead of replacing them with an error, and
    // a hidden tab asks for nothing.
    const timer = setInterval(() => {
      if (inFlight || document.visibilityState === "hidden") return;
      load(() => undefined);
    }, REFRESH_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [slug, attempt]);

  // From the list, so the label shows at all times: loading, failing and loaded.
  const isDemo = communities.find((community) => community.slug === slug)?.isDemo ?? false;
  const selector =
    communities.length > 0 ? (
      <div className="flex items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Comunidad
          <select
            value={slug ?? ""}
            onChange={(event) => {
              setStats(null);
              setSlug(event.target.value);
            }}
            className="h-10 rounded-xl border bg-card px-3 text-base font-normal"
          >
            {communities.map((community) => (
              <option key={community.id} value={community.slug}>
                {community.name}
              </option>
            ))}
          </select>
        </label>
        {isDemo ? (
          <span className="rounded-full bg-brand-yellow px-3 py-1 text-sm font-bold text-brand-black">
            Datos sintéticos
          </span>
        ) : null}
      </div>
    ) : null;

  if (failed) {
    return (
      <Shell>
        {selector}
        <div role="alert" className="space-y-3 rounded-2xl border bg-card p-4">
          <p>No pudimos cargar el panel.</p>
          <Button type="button" onClick={() => setAttempt((count) => count + 1)}>
            Reintentar
          </Button>
        </div>
      </Shell>
    );
  }
  if (!stats) {
    return (
      <Shell>
        {selector}
        {communitiesLoaded && communities.length === 0 ? (
          <EmptyState>Aún no hay comunidades disponibles.</EmptyState>
        ) : (
          <Skeletons />
        )}
      </Shell>
    );
  }
  const { activity } = stats;
  const hasActivity =
    activity.enrolled +
      activity.activeOffers +
      activity.openNeeds +
      activity.acceptedRequests +
      activity.completedTrips >
    0;
  return (
    <Shell>
      {selector}
      <div className="space-y-6">
        {!hasActivity ? (
          <EmptyState>Aún no hay actividad en esta comunidad.</EmptyState>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Card label="Personas inscritas" value={String(activity.enrolled)} />
              <Card label="Conductores" value={String(activity.drivers)} />
              <Card label="Ofertas activas" value={String(activity.activeOffers)} />
              <Card label="Necesidades abiertas" value={String(activity.openNeeds)} />
              <Card
                label="Cobertura"
                value={
                  activity.coverage === null ? "—" : `${Math.round(activity.coverage * 100)} %`
                }
              />
              <Card label="Solicitudes aceptadas" value={String(activity.acceptedRequests)} />
              <Card label="Viajes completados" value={String(activity.completedTrips)} />
            </section>
            <Block title="Impacto vehicular">
              <p className="text-sm font-semibold">Viajes en auto evitados</p>
              <Row label="Potenciales" value={String(stats.vehicleImpact.potential.trips)} />
              <Row label="Verificados" value={String(stats.vehicleImpact.verified.trips)} />
              <Row label="Inducidos" value={String(stats.vehicleImpact.induced)} />
              <Row label="Neto" value={String(stats.vehicleImpact.net)} />
              <Row
                label="CO₂ evitado (estimado)"
                value={`${kg(stats.vehicleImpact.potential.co2Kg)} potencial · ${kg(stats.vehicleImpact.verified.co2Kg)} verificado`}
              />
            </Block>
            <Block title="Beneficio para las personas">
              <Row label="Personas transportadas" value={String(stats.people.transported)} />
              <Row
                label="Desde transporte público"
                value={String(stats.people.fromPublicTransport)}
              />
            </Block>
            <Block title="Lista de espera">
              <p className="text-sm text-muted-foreground">Totales de toda la plataforma.</p>
              <Row label="Instituciones" value={String(stats.waitlist.institutions)} />
              <Row label="Personas" value={String(stats.waitlist.individuals)} />
            </Block>
            {stats.districts.length > 0 ? (
              <Block title="Personas por distrito">
                {stats.districts.map(({ district, people }) => (
                  <Row
                    key={district}
                    label={district}
                    value={people === null ? "menos de 10" : String(people)}
                  />
                ))}
              </Block>
            ) : null}
          </>
        )}
        {stats.comparison ? (
          <Block title="Optimizador vs. primero en llegar">
            <p className="text-sm text-muted-foreground">{`Recomendaciones para el ${stats.comparison.date} · ${stats.comparison.direction === "outbound" ? "Ida" : "Regreso"}`}</p>
            <p className="text-sm text-muted-foreground">
              Son recomendaciones, no viajes aceptados ni completados.
            </p>
            {(
              [
                ["Optimizador", stats.comparison.optimizer],
                ["Primero en llegar", stats.comparison.firstComeFirstServed],
              ] as const
            ).map(([name, counts]) => (
              <div key={name} role="group" aria-label={name} className="space-y-2">
                <h3 className="font-semibold">{name}</h3>
                <Row label="Viajes en auto evitados" value={String(counts.carTripsAvoided)} />
                <Row label="Personas emparejadas" value={String(counts.passengersMatched)} />
              </div>
            ))}
          </Block>
        ) : (
          <Block title="Optimizador vs. primero en llegar">
            <p className="text-sm text-muted-foreground">
              Aún no hay una comparación para esta comunidad.
            </p>
          </Block>
        )}
      </div>
      <p className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span aria-live="polite">{`Actualizado a las ${limaClock.format(new Date(stats.updatedAt))} (hora del servidor)`}</span>
        <Link href="/datos" className="font-semibold underline">
          ¿Cómo calculamos esto?
        </Link>
      </p>
    </Shell>
  );
}

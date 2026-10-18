import Link from "next/link";

import EmptyState from "@/components/empty-state";

import Proposals from "./proposals";

const EMPTY_TRIPS = "Aún no tienes viajes. Busca uno o publica el que ya haces.";

// ponytail: "Tu próximo viaje", matches (US-016) and impact (US-030) show empty states until built.
export default function Inicio({
  name,
  communityId,
  communityName,
}: {
  name: string;
  communityId?: string;
  communityName?: string;
}) {
  return (
    <main className="flex flex-col gap-5 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Hola, {name} 👋</h1>
          <p className="text-muted-foreground">¿A dónde vamos hoy?</p>
        </div>
        {communityName && (
          <p className="flex flex-col rounded-xl bg-muted px-3 py-2 text-sm">
            <span className="font-bold">{communityName}</span>
            <span className="font-medium text-brand-black">
              <span aria-hidden>✓ </span>Miembro verificado
            </span>
          </p>
        )}
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

      <EmptyState tone="dark">{EMPTY_TRIPS}</EmptyState>

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

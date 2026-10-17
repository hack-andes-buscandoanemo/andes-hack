import Link from "next/link";

const EMPTY_TRIPS = "Aún no tienes viajes. Busca uno o publica el que ya haces.";

// ponytail: "Tu próximo viaje", matches (US-016) and impact (US-030) show empty states until built.
export default function Inicio({ name, communityName }: { name: string; communityName?: string }) {
  return (
    <main className="flex flex-col gap-5 px-4 py-4">
      <div>
        <h1 className="text-3xl font-extrabold">Hola, {name} 👋</h1>
        <p className="text-muted-foreground">¿A dónde vamos hoy?</p>
        {communityName && (
          <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-brand-yellow px-3 py-1 text-sm font-bold text-brand-black">
            <span>{communityName}</span>
            <span aria-hidden>·</span>
            <span>Miembro verificado</span>
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
          className="flex min-h-12 items-center justify-center rounded-full border-2 border-foreground px-4 font-bold"
        >
          Ofrecer viaje
        </Link>
      </div>

      <p className="rounded-xl border bg-card p-4 text-muted-foreground">{EMPTY_TRIPS}</p>

      <section aria-labelledby="matches" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 id="matches" className="text-lg font-bold">
            Coincidencias de hoy
          </h2>
          <Link href="/buscar" className="flex min-h-11 items-center font-medium underline">
            Ver todas
          </Link>
        </div>
        <p className="rounded-xl border bg-card p-4 text-muted-foreground">
          Aún no hay coincidencias para hoy.
        </p>
      </section>

      <section aria-labelledby="impact" className="flex flex-col gap-2">
        <h2 id="impact" className="text-lg font-bold">
          Tu impacto
        </h2>
        <p className="rounded-xl border bg-card p-4 text-muted-foreground">
          Tu impacto aparecerá cuando completes tu primer viaje compartido.
        </p>
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api-schema";
import { httpClient } from "@/lib/http-client";

type DataSource = components["schemas"]["DataSource"];

const TOPICS: { id: DataSource["topic"]; title: string }[] = [
  { id: "tiempos", title: "Tiempos de viaje" },
  { id: "impacto", title: "Impacto y combustible" },
  { id: "contexto", title: "Transporte en Lima" },
];

const number = new Intl.NumberFormat("es", { maximumFractionDigits: 3 });

// Soles go before the amount ("S/ 2,43 por viaje"); every other unit goes after it.
function valueLabel({ value, unit }: DataSource) {
  if (typeof value === "string") return `${value} ${unit}`;
  if (unit.startsWith("S/ ")) return `S/ ${number.format(value)} ${unit.slice(3)}`;
  return `${number.format(value)} ${unit}`;
}

// "2026-10-17" → "17-10-2026", the way Lima writes dates.
function dateLabel(date: string) {
  return date.split("-").reverse().join("-");
}

function KindCell({ source }: { source: DataSource }) {
  if (source.kind === "estimado" || !source.url) return <>Estimado</>;
  return (
    <>
      Dato real ·{" "}
      <a href={source.url} target="_blank" rel="noreferrer" className="underline">
        fuente
      </a>{" "}
      · {dateLabel(source.date)}
    </>
  );
}

// Where every number of Te Jalo comes from (US-032). Each topic is an anchor, so an
// estimated figure elsewhere in the app links to /datos#<topic>.
export default function DataPage() {
  const [sources, setSources] = useState<DataSource[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Bumped by "Reintentar" to ask for the table again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setFailed(false);
    httpClient
      .get("/public/data-sources")
      .then((response) => {
        if (active) setSources(response.data.sources);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-extrabold">Datos y supuestos</h1>
        <p className="text-muted-foreground">
          De dónde sale cada número de Te Jalo. Solo llamamos dato real a lo que tiene una fuente
          que puedes revisar; todo lo demás es un estimado del equipo.
        </p>
      </header>
      {failed ? (
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <p role="alert" className="text-sm font-medium text-destructive">
            No pudimos cargar los datos.
          </p>
          <Button type="button" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      ) : sources === null ? (
        <p role="status" className="text-sm text-muted-foreground">
          Cargando datos…
        </p>
      ) : (
        TOPICS.map((topic) => {
          const rows = sources.filter((source) => source.topic === topic.id);
          if (rows.length === 0) return null;
          return (
            <section
              key={topic.id}
              id={topic.id}
              aria-labelledby={`${topic.id}-heading`}
              className="scroll-mt-6 space-y-3"
            >
              <h2 id={`${topic.id}-heading`} className="text-xl font-bold">
                {topic.title}
              </h2>
              <div className="overflow-x-auto rounded-2xl border bg-card">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3 font-semibold">Dato</th>
                      <th className="p-3 font-semibold">Valor</th>
                      <th className="p-3 font-semibold">Tipo</th>
                      <th className="p-3 font-semibold">Fuente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((source) => (
                      <tr key={source.id} id={source.id} className="border-t align-top">
                        <td className="p-3 font-medium">{source.label}</td>
                        <td className="p-3 whitespace-nowrap">{valueLabel(source)}</td>
                        <td className="p-3">
                          <KindCell source={source} />
                        </td>
                        <td className="p-3 text-muted-foreground">{source.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
      <section id="no-medimos" aria-labelledby="no-medimos-heading" className="space-y-3">
        <h2 id="no-medimos-heading" className="text-xl font-bold">
          Qué no medimos
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            La congestión de Lima: los viajes en auto evitados son pocos frente al tráfico de la
            ciudad, y no estimamos cuánto lo reducen.
          </li>
          <li>
            El impacto en una empresa real: las cifras salen de la comunidad demo, no de un piloto.
          </li>
        </ul>
      </section>
      <Link href="/" className="inline-block font-medium underline">
        Volver al inicio
      </Link>
    </main>
  );
}

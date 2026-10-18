"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { RouteMap } from "@/lib/communities-api";
import { findPlace, nearestOnPath, streetAt } from "@/lib/geo";

export interface DropOff {
  lat: number;
  lng: number;
  name: string;
}

// Where to get off when the final destination is not the car's: the point of the route
// closest to where the person is really going, with the street it is on.
export default function DropOffSuggestion({
  route,
  onSuggest,
}: {
  route: RouteMap;
  onSuggest: (dropOff: DropOff | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ street: string; meters: number; place: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function suggest() {
    const text = query.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const place = await findPlace(text);
      const nearest = place ? nearestOnPath(route.path, place) : null;
      if (!place || !nearest) {
        setResult(null);
        onSuggest(null);
        setError("No encontramos ese lugar en Lima. Prueba con una avenida o un lugar conocido.");
        return;
      }
      const street = (await streetAt(nearest.point)) ?? "un punto de la ruta";
      setResult({ street, meters: Math.round(nearest.meters), place: place.name });
      onSuggest({ ...nearest.point, name: `Bájate aquí · ${street}` });
    } catch {
      setError("No pudimos buscar ese lugar ahora. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4 text-sm shadow-sm">
      <h2 className="font-bold">¿Tu destino final es otro?</h2>
      <p className="text-muted-foreground">
        Dinos a dónde vas y te mostramos en qué calle bajarte para quedar lo más cerca posible.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void suggest();
        }}
      >
        <label className="sr-only" htmlFor="final-destination">
          Tu destino final
        </label>
        <input
          id="final-destination"
          value={query}
          maxLength={120}
          placeholder="Ej. Av. Javier Prado, San Isidro"
          onChange={(event) => setQuery(event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
        />
        <Button
          type="submit"
          disabled={busy || !query.trim()}
          className="h-10 rounded-xl font-bold"
        >
          {busy ? "Buscando…" : "Sugerir"}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="rounded-xl bg-brand-yellow/30 p-2" role="status">
          <p className="text-xs font-bold">Punto sugerido para bajarte</p>
          <p>{result.street}</p>
          <p>
            {result.meters < 1000
              ? `A ${result.meters} m de ${result.place}`
              : `A ${(result.meters / 1000).toFixed(1)} km de ${result.place}`}
          </p>
        </div>
      ) : null}
    </section>
  );
}

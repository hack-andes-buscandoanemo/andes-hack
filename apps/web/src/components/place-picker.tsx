"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { findPlaces, streetAt, type Place } from "@/lib/geo";

// One end of a trip, chosen on the map: written and picked from OpenStreetMap's results, or,
// for where the person is, taken from the device's location.
export default function PlacePicker({
  id,
  label,
  value,
  onChange,
  withLocation = false,
  placeholder = "Ej. Av. Javier Prado, San Isidro",
}: {
  id: string;
  label: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
  // Offers "Usar mi ubicación" (the passenger's origin, the driver's departure).
  withLocation?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const text = query.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const found = await findPlaces(text);
      setOptions(found);
      if (found.length === 0) {
        setError("No encontramos ese lugar en Lima. Prueba con una avenida o un lugar conocido.");
      }
    } catch {
      setError("No pudimos buscar ese lugar ahora. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  function useMyLocation() {
    if (busy) return;
    if (!("geolocation" in navigator)) {
      setError("Tu navegador no permite usar la ubicación. Escribe el lugar.");
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const point = { lat: coords.latitude, lng: coords.longitude };
        const street = await streetAt(point);
        onChange({ ...point, label: street ? `Mi ubicación, ${street}` : "Mi ubicación" });
        setBusy(false);
      },
      () => {
        setError("No pudimos obtener tu ubicación. Escribe el lugar.");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  if (value) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-bold">{label}</span>
        <div className="flex items-center justify-between gap-2 rounded-xl bg-brand-yellow/30 p-2 text-sm">
          <span className="font-medium">{value.label}</span>
          <button
            type="button"
            className="px-2 text-xs font-bold underline"
            aria-label={`Cambiar ${label.toLowerCase()}`}
            onClick={() => {
              onChange(null);
              setOptions([]);
              setQuery("");
            }}
          >
            Cambiar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <input
          id={id}
          value={query}
          maxLength={120}
          placeholder={placeholder}
          onChange={(event) => setQuery(event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={busy || !query.trim()}
          className="h-10 rounded-xl font-bold"
        >
          {busy ? "Buscando…" : "Buscar"}
        </Button>
      </form>
      {withLocation ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-fit rounded-lg text-xs font-bold"
          disabled={busy}
          onClick={useMyLocation}
        >
          Usar mi ubicación
        </Button>
      ) : null}
      {options.length > 0 ? (
        <ul aria-label={`Resultados de ${label.toLowerCase()}`} className="flex flex-col gap-1">
          {options.map((option) => (
            <li key={`${option.lat},${option.lng}`}>
              <button
                type="button"
                className="w-full rounded-lg border px-3 py-2 text-left text-sm"
                onClick={() => {
                  onChange(option);
                  setOptions([]);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

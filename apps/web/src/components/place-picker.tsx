"use client";

import { Location01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl bg-highlight py-1.5 pr-1.5 pl-3.5 text-sm text-highlight-foreground">
          <span className="flex min-w-0 items-center gap-2 font-medium">
            <HugeiconsIcon icon={Location01Icon} className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{value.label}</span>
          </span>
          <button
            type="button"
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold underline underline-offset-4 hover:bg-background/40"
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
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={query}
          maxLength={120}
          placeholder={placeholder}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void search();
            }
          }}
          className="field min-w-0 flex-1"
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0 px-3.5 sm:px-4"
          disabled={busy || !query.trim()}
          onClick={() => void search()}
        >
          <HugeiconsIcon icon={Search01Icon} aria-hidden />
          <span>{busy ? "Buscando lugar…" : "Buscar lugar"}</span>
        </Button>
      </div>
      {withLocation ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit"
          disabled={busy}
          onClick={useMyLocation}
        >
          <HugeiconsIcon icon={Location01Icon} aria-hidden />
          Usar mi ubicación
        </Button>
      ) : null}
      {options.length > 0 ? (
        <ul
          aria-label={`Resultados de ${label.toLowerCase()}`}
          className="surface flex flex-col divide-y overflow-hidden shadow-sm"
        >
          {options.map((option) => (
            <li key={`${option.lat},${option.lng}`}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                onClick={() => {
                  onChange(option);
                  setOptions([]);
                }}
              >
                <HugeiconsIcon
                  icon={Location01Icon}
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="text-[0.8125rem] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

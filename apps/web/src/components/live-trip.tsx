"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { reasonOf } from "@/lib/api-error";
import { paymentMethodOptions, soles } from "@/components/trip-price";
import { communitiesApi, type PaymentMethod } from "@/lib/communities-api";
import type { Coordinates } from "@/lib/geo";

// How often the driver's phone sends the car's position, and how often the others ask for it.
const SHARE_EVERY_MS = 8_000;
const FOLLOW_EVERY_MS = 5_000;

type Role = "driver" | "passenger" | "viewer";

// Te Jalo on a trip: the driver turns it on and the app shares the car's position; the
// accepted passengers see the car move on the map, and the rest only learn it is live.
export default function LiveTrip({
  offerId,
  role,
  priceCents = null,
  paymentMethods = [],
  onPosition,
}: {
  offerId: string;
  role: Role;
  // The trip's current price and how it is paid, to prefill the form shown when turning it on.
  priceCents?: number | null;
  paymentMethods?: PaymentMethod[];
  onPosition: (position: Coordinates | null) => void;
}) {
  const [price, setPrice] = useState(priceCents ? (priceCents / 100).toString() : "");
  const [methods, setMethods] = useState<PaymentMethod[]>(paymentMethods);
  const [sharing, setSharing] = useState(false);
  const [active, setActive] = useState(false);
  const [recordedAt, setRecordedAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const lastSent = useRef(0);

  // Everyone but the driver's own phone follows the car by asking for it.
  useEffect(() => {
    let alive = true;
    async function follow() {
      try {
        const live = await communitiesApi.getLiveLocation(offerId);
        if (!alive) return;
        setActive(live.active);
        setRecordedAt(live.position?.recordedAt ?? null);
        if (role !== "driver") onPosition(live.position);
      } catch {
        // The trip page keeps working without the live position.
      }
    }
    void follow();
    if (role === "driver" && sharing) return;
    const timer = setInterval(() => void follow(), FOLLOW_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [offerId, role, sharing, onPosition]);

  // The "hace N s" label ticks every second.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  // Closing the page stops the phone from sharing; the server drops a stale position by itself.
  useEffect(
    () => () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    },
    [],
  );

  function start() {
    if (!("geolocation" in navigator)) {
      setError("Tu navegador no permite compartir la ubicación.");
      return;
    }
    // Soles typed as "5" or "5.50"; the API takes céntimos.
    const typed = price.trim() === "" ? null : Number(price.replace(",", "."));
    if (typed !== null && (!Number.isFinite(typed) || typed < 0 || typed > 200)) {
      setError("Ingresa un precio válido, por ejemplo 5 o 5.50 (máximo S/ 200).");
      return;
    }
    if (typed && methods.length === 0) {
      setError("Elige cómo te pagan: Yape o efectivo.");
      return;
    }
    const priceToSend = typed === null ? null : Math.round(typed * 100);
    setError(null);
    setSharing(true);
    // The price travels once, with the first position; the next ones only move the car.
    let firstPosition = true;
    watchId.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const position = { lat: coords.latitude, lng: coords.longitude };
        onPosition(position);
        setActive(true);
        setRecordedAt(new Date().toISOString());
        if (Date.now() - lastSent.current < SHARE_EVERY_MS) return;
        lastSent.current = Date.now();
        const body = firstPosition
          ? { ...position, priceCents: priceToSend, paymentMethods: priceToSend ? methods : [] }
          : position;
        firstPosition = false;
        communitiesApi.shareLiveLocation(offerId, body).catch((failure) => {
          firstPosition = true;
          setError(reasonOf(failure, "No pudimos compartir tu ubicación."));
        });
      },
      () => {
        setError("Permite el acceso a tu ubicación para activar Te Jalo en vivo.");
        stopWatching();
      },
      { enableHighAccuracy: true, maximumAge: 5_000 },
    );
  }

  function stopWatching() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setSharing(false);
  }

  async function stop() {
    stopWatching();
    lastSent.current = 0;
    onPosition(null);
    setActive(false);
    setRecordedAt(null);
    try {
      await communitiesApi.stopLiveLocation(offerId);
    } catch (failure) {
      setError(reasonOf(failure, "No pudimos apagar Te Jalo en vivo."));
    }
  }

  const seconds = recordedAt
    ? Math.max(0, Math.round((now - new Date(recordedAt).getTime()) / 1000))
    : null;
  const ago = seconds === null ? "" : ` · actualizado hace ${seconds} s`;

  if (role === "driver") {
    return (
      <section className="space-y-3 rounded-2xl border bg-card p-5 text-sm shadow-sm">
        <h2 className="text-base font-semibold tracking-tight">Te Jalo en vivo</h2>
        <p className="text-muted-foreground">
          {sharing
            ? `Compartes la posición de tu auto con los pasajeros aceptados${ago}.`
            : "Actívalo al salir: los pasajeros aceptados ven tu auto moverse en el mapa."}
        </p>
        {error ? (
          <p role="alert" className="font-medium text-destructive">
            {error}
          </p>
        ) : null}
        {sharing ? (
          <>
            {price.trim() ? (
              <p className="font-semibold tabular-nums">{`Precio: ${soles(Math.round(Number(price.replace(",", ".")) * 100))} por asiento`}</p>
            ) : null}
            <Button type="button" variant="outline" className="w-full" onClick={() => void stop()}>
              Apagar Te Jalo en vivo
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="live-price" className="font-medium">
                Precio por asiento (S/, opcional)
              </label>
              <input
                id="live-price"
                inputMode="decimal"
                placeholder="5.00"
                maxLength={6}
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                className="field"
              />
            </div>
            {price.trim() ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="font-medium">Cómo te pagan</legend>
                <div className="flex gap-2">
                  {paymentMethodOptions.map((option) => {
                    const on = methods.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setMethods((current) =>
                            on
                              ? current.filter((method) => method !== option.value)
                              : [...current, option.value],
                          )
                        }
                        className={`min-h-11 rounded-xl border px-5 text-sm font-medium shadow-xs transition-colors ${
                          on ? "border-foreground bg-highlight font-semibold" : "bg-card"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
            <Button type="button" className="w-full" onClick={start}>
              {active ? "Reanudar Te Jalo en vivo" : "Activar Te Jalo en vivo"}
            </Button>
          </>
        )}
      </section>
    );
  }

  if (!active) {
    return role === "passenger" ? (
      <p className="rounded-2xl border bg-card p-3 text-sm text-muted-foreground shadow-sm">
        El conductor aún no activó Te Jalo en vivo. Verás su auto aquí cuando salga.
      </p>
    ) : null;
  }

  return (
    <p
      role="status"
      className="rounded-2xl border bg-highlight p-3 text-sm font-semibold shadow-sm"
    >
      {role === "passenger"
        ? `El conductor está en camino${ago}.`
        : "El conductor tiene Te Jalo en vivo activado."}
    </p>
  );
}

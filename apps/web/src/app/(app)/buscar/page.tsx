"use client";

import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";

import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/page-header";
import PlacePicker from "@/components/place-picker";
import SearchRouteMap from "@/components/search-route-map";
import { Button } from "@/components/ui/button";
import {
  communitiesApi,
  type MembershipSummary,
  type SearchTripsResponse,
} from "@/lib/communities-api";
import { streetAt, type Place } from "@/lib/geo";

import { addDays, clockLabel, limaToday, shiftClock, TIME_SLOTS, WEEKDAYS } from "./schedule";
import { FALLBACK_FOR_USUAL_MODE, FALLBACK_OPTIONS, REASON_MESSAGES } from "./reasons";
import { FUEL_NOTE } from "@/components/fuel-estimate";

import TripCard from "./trip-card";

const selectClass = "field font-normal";
const fieldLabel = "flex flex-col gap-1.5 text-sm font-medium";

type DayChoice = "today" | "tomorrow" | "other" | "days";

export default function SearchPage() {
  const [memberships, setMemberships] = useState<MembershipSummary[]>([]);
  const [communityId, setCommunityId] = useState("");
  // Where the person leaves from and where they are going, chosen on the map. The origin starts
  // as the device's location when it is allowed; neither is kept after the search.
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [mapOfferId, setMapOfferId] = useState<string | null>(null);
  const [dayChoice, setDayChoice] = useState<DayChoice>("today");
  const [days, setDays] = useState<number[]>([]);
  const [otherDate, setOtherDate] = useState("");
  const [windowStart, setWindowStart] = useState("07:30");
  const [windowEnd, setWindowEnd] = useState("08:30");
  const [result, setResult] = useState<SearchTripsResponse | null>(null);
  const [fallbackMode, setFallbackMode] =
    useState<(typeof FALLBACK_OPTIONS)[number]["value"]>("other");
  const [womenOnly, setWomenOnly] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const membership = memberships.find((item) => item.communityId === communityId) ?? null;

  useEffect(() => {
    let active = true;
    communitiesApi
      .getMe()
      .then((me) => {
        const first = me.memberships[0];
        if (!active || !first) return;
        const query = new URLSearchParams(window.location.search);
        const selected =
          me.memberships.find((item) => item.communityId === query.get("communityId")) ?? first;
        setMemberships(me.memberships);
        setCommunityId(selected.communityId);
        setFallbackMode(FALLBACK_FOR_USUAL_MODE[selected.usualMode ?? "other"] ?? "other");
        // The saved "Solo mujeres" of the membership the search opens on (US-026).
        setWomenOnly(selected.womenOnly);
      })
      .catch(() => {
        if (active) setLoadError("No pudimos cargar tu cuenta. Inténtalo de nuevo.");
      });
    return () => {
      active = false;
    };
  }, []);

  // The location is asked for as soon as the screen opens; a refusal leaves the box to write.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    let active = true;
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const point = { lat: coords.latitude, lng: coords.longitude };
        const street = await streetAt(point);
        if (!active) return;
        // A place the person already wrote is not replaced.
        setOrigin(
          (current) =>
            current ?? { ...point, label: street ? `Mi ubicación, ${street}` : "Mi ubicación" },
        );
      },
      () => {
        // Denied or unavailable: the person writes where they are.
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
    return () => {
      active = false;
    };
  }, []);

  function tripDate() {
    if (dayChoice === "days") return null;
    if (dayChoice === "other") return otherDate;
    return addDays(limaToday(), dayChoice === "tomorrow" ? 1 : 0);
  }

  async function handleSearch(range = { start: windowStart, end: windowEnd }) {
    if (!membership || searching) return;
    if (!origin || !destination) {
      setError("Elige dónde estás y a dónde vas.");
      return;
    }
    if (dayChoice === "other" && !otherDate) {
      setDateError("Elige la fecha del viaje.");
      return;
    }
    if (dayChoice === "days" && days.length === 0) {
      setDateError("Elige al menos un día.");
      return;
    }
    setError(null);
    setDateError(null);
    setSearching(true);
    setResult(null);
    try {
      const response = await communitiesApi.searchTrips(membership.communityId, {
        direction: "outbound",
        location: { lat: origin.lat, lng: origin.lng },
        locationLabel: origin.label,
        destination: { lat: destination.lat, lng: destination.lng },
        destinationLabel: destination.label,
        windowStart: range.start,
        windowEnd: range.end,
        date: tripDate(),
        daysOfWeek: dayChoice === "days" ? days : null,
        maxWalkMinutes: 15,
        fallbackMode,
        womenOnly,
      });
      setResult(response);
      setMapOfferId(response.matches[0]?.offerId ?? null);
    } catch (err: unknown) {
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(apiError ?? "No pudimos buscar viajes. Inténtalo de nuevo.");
    } finally {
      setSearching(false);
    }
  }

  function widenWindow() {
    if (searching) return;
    const range = { start: shiftClock(windowStart, -15), end: shiftClock(windowEnd, 15) };
    setWindowStart(range.start);
    setWindowEnd(range.end);
    void handleSearch(range);
  }

  return (
    <main className="flex flex-col gap-6 px-4 pt-2 pb-6">
      <PageHeader title="Buscar viaje" description="Encuentra personas que van en tu dirección" />
      {loadError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {loadError}
        </p>
      ) : null}
      <div className="flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            <PlacePicker
              id="origin-point"
              label="Dónde estás"
              value={origin}
              onChange={setOrigin}
              withLocation
            />
            <PlacePicker
              id="destination-point"
              label="A dónde vas"
              value={destination}
              onChange={setDestination}
            />
            <p className="text-xs text-muted-foreground">
              Buscamos viajes cuya ruta pase cerca de los dos puntos y ordenamos por cuál te deja
              más cerca de tu destino. No guardamos tu dirección exacta.
            </p>
          </div>
          <div className="flex flex-col gap-2 border-t pt-5">
            <label className={fieldLabel}>
              Fecha
              <select
                className={selectClass}
                value={dayChoice}
                onChange={(event) => setDayChoice(event.target.value as DayChoice)}
              >
                <option value="today">Hoy</option>
                <option value="tomorrow">Mañana</option>
                <option value="other">Otra fecha</option>
                <option value="days">Días</option>
              </select>
            </label>
            {dayChoice === "other" ? (
              <input
                type="date"
                className={selectClass}
                aria-label="Día del viaje"
                min={limaToday()}
                value={otherDate}
                onChange={(event) => setOtherDate(event.target.value)}
              />
            ) : null}
            {dayChoice === "days" ? (
              <div role="group" aria-label="Días" className="flex gap-1.5">
                {WEEKDAYS.map((day) => (
                  <Button
                    key={day.iso}
                    type="button"
                    size="icon-sm"
                    variant={days.includes(day.iso) ? "default" : "outline"}
                    className="rounded-full"
                    aria-label={day.name}
                    aria-pressed={days.includes(day.iso)}
                    onClick={() =>
                      setDays((current) =>
                        current.includes(day.iso)
                          ? current.filter((iso) => iso !== day.iso)
                          : [...current, day.iso].sort(),
                      )
                    }
                  >
                    {day.name[0]}
                  </Button>
                ))}
              </div>
            ) : null}
            {dateError ? <p className="text-sm font-medium text-destructive">{dateError}</p> : null}
          </div>
          <fieldset>
            <legend className="sr-only">Horario</legend>
            <div className="flex flex-col gap-1.5 text-sm">
              <span aria-hidden className="font-medium">
                Horario
              </span>
              <span className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-muted-foreground">
                <select
                  className={selectClass}
                  aria-label="Desde"
                  value={windowStart}
                  onChange={(event) => setWindowStart(event.target.value)}
                >
                  {[...new Set([...TIME_SLOTS, windowStart])].sort().map((slot) => (
                    <option key={slot} value={slot}>
                      {clockLabel(slot)}
                    </option>
                  ))}
                </select>
                –
                <select
                  className={selectClass}
                  aria-label="Hasta"
                  value={windowEnd}
                  onChange={(event) => setWindowEnd(event.target.value)}
                >
                  {[...new Set([...TIME_SLOTS, windowEnd])].sort().map((slot) => (
                    <option key={slot} value={slot}>
                      {clockLabel(slot)}
                    </option>
                  ))}
                </select>
              </span>
            </div>
          </fieldset>
          {memberships.length > 1 ? (
            <label className={fieldLabel}>
              Comunidad
              <select
                className={selectClass}
                value={communityId}
                onChange={(event) => {
                  setCommunityId(event.target.value);
                  setResult(null);
                }}
              >
                {memberships.map((item) => (
                  <option key={item.communityId} value={item.communityId}>
                    {item.communityName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {membership?.identifiesAsWoman ? (
            <label className="flex items-center gap-2.5 text-sm font-medium">
              <input
                type="checkbox"
                checked={womenOnly}
                onChange={(event) => setWomenOnly(event.target.checked)}
              />
              Solo mujeres
            </label>
          ) : null}
          <label className={`${fieldLabel} border-t pt-5`}>
            Si no encuentras viaje, ¿cómo irías?
            <select
              className={selectClass}
              value={fallbackMode}
              onChange={(event) => setFallbackMode(event.target.value as typeof fallbackMode)}
            >
              {FALLBACK_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={searching}
          onClick={() => handleSearch()}
        >
          <HugeiconsIcon icon={Search01Icon} className="size-5" aria-hidden />
          Buscar coincidencias
        </Button>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      {searching ? (
        <p role="status" className="text-sm text-muted-foreground">
          Buscando viajes compatibles…
        </p>
      ) : null}
      <section aria-live="polite" className="flex flex-col gap-3">
        {result ? (
          <>
            <h2 className="text-lg font-semibold tracking-tight">
              {result.matches.length === 1
                ? "1 coincidencia encontrada"
                : `${result.matches.length} coincidencias encontradas`}
            </h2>
            {result.reason ? (
              <EmptyState>
                <span className="block font-medium text-foreground">
                  {REASON_MESSAGES[result.reason]}
                </span>
                <span className="block text-xs">
                  Guardamos tu búsqueda para el emparejamiento de la jornada.
                </span>
              </EmptyState>
            ) : null}
            {result.matches.length === 0 ? (
              <Button type="button" variant="outline" disabled={searching} onClick={widenWindow}>
                Ampliar horario 15 min
              </Button>
            ) : null}
            {(() => {
              const onMap =
                result.matches.find((match) => match.offerId === mapOfferId) ?? result.matches[0];
              return onMap ? (
                <div className="overflow-hidden rounded-2xl border bg-card p-1.5 shadow-sm">
                  <SearchRouteMap match={onMap} me={origin} destination={destination} />
                </div>
              ) : null;
            })()}
            <ul className="flex flex-col gap-3">
              {result.matches.map((match, index) => (
                <TripCard
                  key={match.offerId}
                  match={match}
                  communityName={membership?.communityName ?? ""}
                  best={index === 0}
                  onMap={(mapOfferId ?? result.matches[0]?.offerId) === match.offerId}
                  onShowMap={() => setMapOfferId(match.offerId)}
                />
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{FUEL_NOTE}</p>
          </>
        ) : null}
      </section>
    </main>
  );
}

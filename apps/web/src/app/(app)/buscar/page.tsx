"use client";

import { useEffect, useState } from "react";

import EmptyState from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  communitiesApi,
  type MembershipSummary,
  type SearchTripsResponse,
  type ZoneSummary,
} from "@/lib/communities-api";

import { addDays, clockLabel, limaToday, shiftClock, TIME_SLOTS, WEEKDAYS } from "./schedule";
import { FALLBACK_FOR_USUAL_MODE, FALLBACK_OPTIONS, REASON_MESSAGES } from "./reasons";
import { FUEL_NOTE } from "@/components/fuel-estimate";

import TripCard from "./trip-card";

const selectClass =
  "h-9 max-w-52 rounded-lg border border-input bg-background px-2 text-sm font-normal";

type DayChoice = "today" | "tomorrow" | "other" | "days";

export default function SearchPage() {
  const [memberships, setMemberships] = useState<MembershipSummary[]>([]);
  const [communityId, setCommunityId] = useState("");
  const [zones, setZones] = useState<ZoneSummary[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [outbound, setOutbound] = useState(true);
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
        setMemberships(me.memberships);
        setCommunityId(first.communityId);
        setFallbackMode(FALLBACK_FOR_USUAL_MODE[first.usualMode ?? "other"] ?? "other");
        // The profile's "Solo mujeres" preference is where every search starts (US-026).
        setWomenOnly(first.womenOnly);
      })
      .catch(() => {
        if (active) setLoadError("No pudimos cargar tu cuenta. Inténtalo de nuevo.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!communityId) return;
    let active = true;
    communitiesApi
      .listCommunityZones(communityId)
      .then((list) => {
        if (active) setZones(list);
      })
      .catch(() => {
        if (active) setLoadError("No pudimos cargar tus zonas. Inténtalo de nuevo.");
      });
    return () => {
      active = false;
    };
  }, [communityId]);

  function tripDate() {
    if (dayChoice === "days") return null;
    if (dayChoice === "other") return otherDate;
    return addDays(limaToday(), dayChoice === "tomorrow" ? 1 : 0);
  }

  async function handleSearch(range = { start: windowStart, end: windowEnd }) {
    if (!membership || searching) return;
    if (!zoneId) {
      setError("Selecciona tu zona.");
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
      setResult(
        await communitiesApi.searchTrips(membership.communityId, {
          direction: outbound ? "outbound" : "return",
          originZoneId: zoneId,
          windowStart: range.start,
          windowEnd: range.end,
          date: tripDate(),
          daysOfWeek: dayChoice === "days" ? days : null,
          maxWalkMinutes: 15,
          fallbackMode,
          womenOnly,
        }),
      );
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
    <main className="flex flex-col gap-4 px-4 py-4">
      <header>
        <h1 className="text-3xl font-extrabold">Buscar viaje</h1>
        <p className="text-muted-foreground">Encuentra personas que van en tu dirección</p>
      </header>
      {loadError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {loadError}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col divide-y">
          <div className="flex items-start gap-2 pb-3">
            <div className="flex flex-1 flex-col gap-3">
              {(outbound ? ["Origen", "Destino"] : ["Destino", "Origen"]).map((name) => {
                const isCommunityEnd = outbound ? name === "Destino" : name === "Origen";
                return (
                  <div
                    key={name}
                    role="group"
                    aria-label={name}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="font-bold">{name}</span>
                    {isCommunityEnd ? (
                      <span className="text-right font-medium">{membership?.destinationName}</span>
                    ) : (
                      <div className="flex flex-col items-end gap-1">
                        <select
                          className={selectClass}
                          aria-label="Mi zona"
                          value={zoneId}
                          onChange={(event) => setZoneId(event.target.value)}
                        >
                          <option value="">Elige tu zona</option>
                          {zones.map((zone) => (
                            <option key={zone.id} value={zone.id}>
                              {zone.name}
                            </option>
                          ))}
                        </select>
                        <span className="text-xs text-muted-foreground">
                          No pedimos tu dirección exacta
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-full"
              aria-label="Invertir sentido"
              onClick={() => setOutbound((value) => !value)}
            >
              ⇅
            </Button>
          </div>
          <div className="flex flex-col gap-2 py-3">
            <label className="flex items-center justify-between gap-3 text-sm font-bold">
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
              <div role="group" aria-label="Días" className="flex gap-1">
                {WEEKDAYS.map((day) => (
                  <Button
                    key={day.iso}
                    type="button"
                    size="sm"
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
          <fieldset className="py-3">
            <legend className="sr-only">Horario</legend>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span aria-hidden className="font-bold">
                Horario
              </span>
              <span className="flex items-center gap-2">
                <select
                  className={selectClass}
                  aria-label="Desde"
                  value={windowStart}
                  onChange={(event) => setWindowStart(event.target.value)}
                >
                  {TIME_SLOTS.map((slot) => (
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
                  {TIME_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {clockLabel(slot)}
                    </option>
                  ))}
                </select>
              </span>
            </div>
          </fieldset>
          {memberships.length > 1 ? (
            <label className="flex items-center justify-between gap-3 py-3 text-sm font-bold">
              Comunidad
              <select
                className={selectClass}
                value={communityId}
                onChange={(event) => {
                  setCommunityId(event.target.value);
                  setZoneId("");
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
            <label className="flex items-center gap-2 py-3 text-sm font-bold">
              <input
                type="checkbox"
                checked={womenOnly}
                onChange={(event) => setWomenOnly(event.target.checked)}
              />
              Solo mujeres
            </label>
          ) : null}
          <label className="flex flex-col gap-1 pt-3 text-sm font-bold">
            Si no encuentras viaje, ¿cómo irías?
            <select
              className={`${selectClass} max-w-none`}
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
          className="h-11 w-full rounded-xl text-sm font-bold"
          disabled={searching}
          onClick={() => handleSearch()}
        >
          Buscar coincidencias
        </Button>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      {searching ? <p role="status">Buscando viajes compatibles…</p> : null}
      <section aria-live="polite" className="flex flex-col gap-3">
        {result ? (
          <>
            <h2 className="text-lg font-extrabold">
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
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                disabled={searching}
                onClick={widenWindow}
              >
                Ampliar horario 15 min
              </Button>
            ) : null}
            <ul className="flex flex-col gap-3">
              {result.matches.map((match, index) => (
                <TripCard
                  key={match.offerId}
                  match={match}
                  communityName={membership?.communityName ?? ""}
                  best={index === 0}
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

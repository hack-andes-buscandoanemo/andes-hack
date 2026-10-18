"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/page-header";
import { CancelTripDialog } from "@/components/cancel-trip-dialog";
import { pairReturns, type PairedReturn } from "@/components/return-pairs";
import ReturnTripCard from "@/components/return-trip-card";
import ShareTrip from "@/components/share-trip";
import TripProgress from "@/components/trip-progress";
import TripSummaryCard from "@/components/trip-summary-card";
import { FUEL_NOTE } from "@/components/fuel-estimate";
import { Button, buttonVariants } from "@/components/ui/button";
import { communitiesApi, type MyTrip } from "@/lib/communities-api";

function isLateTrip(trip: MyTrip): boolean {
  try {
    const [hours, minutes] = trip.time.slice(0, 5).split(":").map(Number);
    if (hours === undefined || minutes === undefined) return false;
    const now = new Date();
    const todayLima = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(now);
    let targetDateStr = trip.date;
    if (!targetDateStr && trip.daysOfWeek && trip.daysOfWeek.length > 0) {
      const limaDay = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Lima",
        weekday: "short",
      }).format(now);
      const dayMap: Record<string, number> = {
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
        Sun: 7,
      };
      const currentIsoDay = dayMap[limaDay];
      if (currentIsoDay && trip.daysOfWeek.includes(currentIsoDay)) {
        targetDateStr = todayLima;
      } else {
        return false;
      }
    }
    if (!targetDateStr) return false;
    const target = new Date(
      `${targetDateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00-05:00`,
    );
    const diff = target.getTime() - now.getTime();
    return diff < 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function TripCard({
  trip,
  busy,
  onToggle,
  onCancel,
  isCancelling,
  cancelSubmitting,
  onConfirmCancel,
  onDismissCancel,
  upcoming,
  returns,
}: {
  trip: MyTrip;
  busy: boolean;
  onToggle: (trip: MyTrip) => void;
  onCancel: (trip: MyTrip) => void;
  isCancelling: boolean;
  cancelSubmitting: boolean;
  onConfirmCancel: (trip: MyTrip) => void;
  onDismissCancel: () => void;
  // Day-of-trip buttons and the return card only make sense for trips still ahead.
  upcoming: boolean;
  returns: PairedReturn[];
}) {
  const canCancel =
    (trip.role === "driver" && (trip.status === "active" || trip.status === "paused")) ||
    (trip.role === "passenger" && (trip.status === "accepted" || trip.status === "pending"));

  return (
    <li>
      <TripSummaryCard trip={trip}>
        {trip.role === "driver" && (trip.status === "active" || trip.status === "paused") ? (
          <Link
            href={`/viajes/${trip.offerId}/solicitudes`}
            className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}
          >
            Solicitudes
          </Link>
        ) : null}
        {trip.role === "driver" && (trip.status === "active" || trip.status === "paused") ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onToggle(trip)}
          >
            {trip.status === "paused" ? "Reactivar" : "Pausar"}
          </Button>
        ) : null}
        {trip.role === "passenger" && trip.status === "accepted" ? (
          <ShareTrip bookingId={trip.id} label="Compartir viaje" />
        ) : null}
        {upcoming &&
        ((trip.role === "passenger" && trip.status === "accepted") ||
          (trip.role === "driver" && trip.status === "active")) ? (
          <TripProgress trip={trip} />
        ) : null}
        {canCancel ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            className="text-destructive hover:text-destructive"
            onClick={() => onCancel(trip)}
          >
            Cancelar viaje
          </Button>
        ) : null}
        {isCancelling ? (
          <CancelTripDialog
            isOpen={true}
            isLate={isLateTrip(trip)}
            submitting={cancelSubmitting}
            onConfirm={() => onConfirmCancel(trip)}
            onDismiss={onDismissCancel}
          />
        ) : null}
        {upcoming ? <ReturnTripCard trip={trip} returns={returns} /> : null}
      </TripSummaryCard>
    </li>
  );
}

export default function Viajes() {
  const searchParams = useSearchParams();
  const [trips, setTrips] = useState<MyTrip[] | null>(null);
  const roleParam = searchParams?.get("role");
  const linkedRole =
    roleParam === "conductor" ? "driver" : roleParam === "pasajero" ? "passenger" : null;
  const [role, setRole] = useState<"passenger" | "driver">(linkedRole ?? "passenger");
  // The smart default (driver view when only that has trips) applies once, before the person chooses.
  const decided = useRef(linkedRole !== null);
  const tabParam = searchParams?.get("tab");
  const [scope, setScope] = useState<"upcoming" | "past">(
    tabParam === "historial" ? "past" : "upcoming",
  );
  // The Perfil link can change the param while this screen is already open.
  useEffect(() => {
    setScope(tabParam === "historial" ? "past" : "upcoming");
  }, [tabParam]);
  const [failed, setFailed] = useState(false);
  const [toggleFailed, setToggleFailed] = useState(false);
  const [cancelFailed, setCancelFailed] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [cancellingTripId, setCancellingTripId] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setTrips(null);
    setCancellingTripId(null);
    (async () => {
      const response = await communitiesApi.listMyTrips(role, scope);
      if (!decided.current && role === "passenger" && scope === "upcoming") {
        decided.current = true;
        if (response.trips.length === 0) {
          const asDriver = await communitiesApi.listMyTrips("driver", scope);
          if (asDriver.trips.length > 0) {
            if (active) setRole("driver");
            return;
          }
        }
      }
      if (active) setTrips(response.trips);
    })().catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [role, scope, attempt]);

  // Pair outbound and return once per list, not once per card.
  const returnsByTrip = useMemo(() => pairReturns(trips ?? []), [trips]);

  async function toggle(trip: MyTrip) {
    if (togglingId) return;
    setToggleFailed(false);
    setTogglingId(trip.id);
    try {
      // Show what the server saved, not what we asked for.
      const saved = await communitiesApi.updateOfferStatus(
        trip.offerId,
        trip.status === "paused" ? "active" : "paused",
      );
      setTrips(
        (current) =>
          current?.map((item) =>
            item.id === trip.id ? { ...item, status: saved.status } : item,
          ) ?? null,
      );
    } catch {
      setToggleFailed(true);
    } finally {
      setTogglingId(null);
    }
  }

  async function handleCancel(trip: MyTrip) {
    if (cancelSubmitting) return;
    setCancelSubmitting(true);
    setCancelFailed(false);
    try {
      if (trip.role === "driver") {
        await communitiesApi.cancelOffer(trip.offerId);
      } else {
        await communitiesApi.cancelBooking(trip.id);
      }
      setTrips(
        (current) =>
          current?.map((item) => (item.id === trip.id ? { ...item, status: "cancelled" } : item)) ??
          null,
      );
      setCancellingTripId(null);
    } catch {
      setCancelFailed(true);
    } finally {
      setCancelSubmitting(false);
    }
  }

  return (
    <main className="flex flex-col gap-5 px-4 pt-2 pb-6">
      <PageHeader title="Viajes" />
      <div
        role="tablist"
        aria-label="Periodo"
        className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
      >
        {(
          [
            ["upcoming", "Próximos"],
            ["past", "Historial"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            role="tab"
            id={`trips-tab-${value}`}
            aria-controls="trips-panel"
            aria-selected={scope === value}
            tabIndex={scope === value ? 0 : -1}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              decided.current = true;
              setScope(value === "upcoming" ? "past" : "upcoming");
              document
                .getElementById(`trips-tab-${value === "upcoming" ? "past" : "upcoming"}`)
                ?.focus();
            }}
            variant="ghost"
            className={`h-10 rounded-lg ${scope === value ? "bg-card text-foreground shadow-sm hover:bg-card" : "text-muted-foreground"}`}
            onClick={() => {
              decided.current = true;
              setScope(value);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        {(
          [
            ["passenger", "Como pasajero"],
            ["driver", "Como conductor"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            aria-pressed={role === value}
            variant="outline"
            className="rounded-full"
            onClick={() => {
              decided.current = true;
              setRole(value);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="trips-panel"
        aria-labelledby={`trips-tab-${scope}`}
        className="flex flex-col gap-4"
      >
        {toggleFailed ? (
          <p role="alert" className="text-sm text-destructive">
            No pudimos actualizar el viaje. Inténtalo de nuevo.
          </p>
        ) : null}
        {cancelFailed ? (
          <p role="alert" className="text-sm text-destructive">
            No pudimos cancelar el viaje. Inténtalo de nuevo.
          </p>
        ) : null}
        {failed ? (
          <div role="alert" className="flex flex-col gap-2 surface p-5">
            <p>No pudimos cargar tus viajes.</p>
            <Button type="button" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              Reintentar
            </Button>
          </div>
        ) : trips === null ? (
          <div role="status" className="space-y-3">
            <span className="sr-only">Cargando viajes…</span>
            <div className="h-40 animate-pulse rounded-2xl bg-muted" />
            <div className="h-40 animate-pulse rounded-2xl bg-muted" />
          </div>
        ) : trips.length === 0 ? (
          <EmptyState>Aún no tienes viajes. Busca uno o publica el que ya haces.</EmptyState>
        ) : (
          <>
            <ul className="space-y-3">
              {trips.map((trip) => (
                <TripCard
                  key={`${trip.id}:${trip.date ?? ""}`}
                  trip={trip}
                  busy={
                    togglingId === trip.id || (cancelSubmitting && cancellingTripId === trip.id)
                  }
                  onToggle={toggle}
                  onCancel={(t) => setCancellingTripId(t.id)}
                  isCancelling={cancellingTripId === trip.id}
                  cancelSubmitting={cancelSubmitting}
                  onConfirmCancel={handleCancel}
                  onDismissCancel={() => setCancellingTripId(null)}
                  upcoming={scope === "upcoming"}
                  returns={returnsByTrip.get(trip.id) ?? []}
                />
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{FUEL_NOTE}</p>
          </>
        )}
      </div>
    </main>
  );
}

"use client";

import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import EmptyState from "@/components/empty-state";
import ProfileAvatar from "@/components/profile-avatar";
import { Button } from "@/components/ui/button";
import { reasonOf } from "@/lib/api-error";
import { trackEvent } from "@/lib/analytics";
import { communitiesApi, type OfferBookingsResponse } from "@/lib/communities-api";

const NO_SHOW_OPENS_MINUTES_AFTER = 10;
const TODAY_LABELS = {
  in_progress: "En el auto",
  arrived: "Llegó bien",
  no_show: "No se presentó",
} as const;

// Minutes since midnight in Lima. The server stays the authority; this only decides whether
// the button looks open.
function limaMinutes(now: Date) {
  const [hours = 0, minutes = 0] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(now)
    .split(":")
    .map(Number);
  return hours * 60 + minutes;
}

function noShowOpen(pickupAt: string, now: Date) {
  const [hours = 0, minutes = 0] = pickupAt.split(":").map(Number);
  return limaMinutes(now) >= hours * 60 + minutes + NO_SHOW_OPENS_MINUTES_AFTER;
}

export default function BookingRequests({ offerId }: { offerId: string }) {
  const [result, setResult] = useState<OfferBookingsResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [confirmingId, setConfirmingId] = useState("");
  const [now, setNow] = useState(() => new Date());

  // The button opens by itself while the driver waits at the meeting point.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    communitiesApi
      .listOfferBookings(offerId)
      .then((data) => {
        if (active) setResult(data);
      })
      .catch(() => {
        if (active) setError("No pudimos cargar las solicitudes. Inténtalo de nuevo.");
      });
    return () => {
      active = false;
    };
  }, [offerId]);

  async function markNoShow(bookingId: string) {
    setBusyId(bookingId);
    setError("");
    setNotice("");
    try {
      const { message } = await communitiesApi.noShowBooking(bookingId);
      setResult((current) =>
        current
          ? {
              ...current,
              bookings: current.bookings.map((item) =>
                item.id === bookingId ? { ...item, today: "no_show" as const } : item,
              ),
            }
          : current,
      );
      setNotice(message);
    } catch (cause) {
      setError(reasonOf(cause, "No se pudo actualizar la solicitud."));
    } finally {
      setBusyId("");
      setConfirmingId("");
    }
  }

  async function decide(bookingId: string, action: "accept" | "reject") {
    setBusyId(bookingId);
    setError("");
    setNotice("");
    try {
      if (action === "accept") {
        await communitiesApi.acceptBooking(bookingId);
        trackEvent("Pasajero aceptado");
        setResult((current) =>
          current
            ? {
                ...current,
                seatsTaken: current.seatsTaken + 1,
                bookings: current.bookings.map((booking) =>
                  booking.id === bookingId ? { ...booking, status: "accepted" } : booking,
                ),
              }
            : current,
        );
        setNotice("Pasajero aceptado. Ya pueden coordinar en el chat.");
      } else {
        await communitiesApi.rejectBooking(bookingId);
        setResult((current) =>
          current
            ? {
                ...current,
                bookings: current.bookings.filter((booking) => booking.id !== bookingId),
              }
            : current,
        );
        setNotice("Solicitud rechazada.");
      }
    } catch (cause) {
      setError(reasonOf(cause, "No se pudo actualizar la solicitud."));
    } finally {
      setBusyId("");
    }
  }

  if (error && !result) return <p role="alert">{error}</p>;
  if (!result) return <p role="status">Cargando solicitudes…</p>;

  return (
    <main className="flex flex-col gap-4 px-4 pt-2 pb-6">
      <div className="space-y-3">
        <Link
          href={`/viajes/${offerId}`}
          className="-ml-1 inline-flex min-h-9 items-center gap-1 rounded-lg px-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" aria-hidden />
          Detalle del viaje
        </Link>
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Solicitudes</h1>
        <p className="text-[0.9375rem] text-muted-foreground tabular-nums">{`${result.seatsTaken} de ${result.seatsTotal} asientos ocupados`}</p>
      </div>
      {result.seatsTaken >= result.seatsTotal ? (
        <p
          role="status"
          className="rounded-xl bg-highlight px-4 py-3 text-sm font-medium text-highlight-foreground"
        >
          Tu auto ya está lleno.
        </p>
      ) : null}
      {result.bookings.length === 0 ? (
        <EmptyState>Aún no hay solicitudes para este viaje.</EmptyState>
      ) : null}
      <ul className="space-y-3">
        {result.bookings.map((booking) => (
          <li
            key={booking.id}
            className={`space-y-3 surface p-5 text-sm ${booking.recommended ? "ring-2 ring-brand-yellow" : ""}`}
          >
            <div className="flex items-center gap-3">
              <ProfileAvatar
                name={booking.passengerName}
                photoUrl={booking.passengerPhotoUrl}
                className="size-11"
              />
              <h2 className="text-base font-semibold tracking-tight">
                {booking.passengerName} · Miembro verificado
              </h2>
            </div>
            <div className="space-y-1">
              <p>{`Punto de encuentro: ${booking.meetingPointName}`}</p>
              <p className="tabular-nums">{`Recogida ${booking.pickupAt}`}</p>
            </div>
            <ul className="flex flex-wrap gap-1.5 text-xs font-medium">
              <li className="rounded-full bg-secondary px-2.5 py-1">{`+${booking.detourMinutes} min de desvío`}</li>
              {booking.avoidsCar ? (
                <li className="rounded-full bg-success/15 px-2.5 py-1 text-success">
                  Evita un viaje en auto
                </li>
              ) : null}
              {booking.recommended ? (
                <li className="rounded-full bg-brand-yellow px-2.5 py-1 text-brand-black">
                  Recomendado
                </li>
              ) : null}
            </ul>
            {booking.message ? (
              <p className="rounded-xl bg-muted px-3.5 py-2.5">{`Mensaje: ${booking.message}`}</p>
            ) : null}
            {booking.status === "pending" ? (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  type="button"
                  disabled={Boolean(busyId) || result.seatsTaken >= result.seatsTotal}
                  onClick={() => decide(booking.id, "accept")}
                >
                  {busyId === booking.id ? "Actualizando…" : "Aceptar"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={Boolean(busyId)}
                  onClick={() => decide(booking.id, "reject")}
                >
                  Rechazar
                </Button>
              </div>
            ) : null}
            {booking.status === "accepted" && booking.today && booking.today !== "not_started" ? (
              <p className="font-semibold">{TODAY_LABELS[booking.today]}</p>
            ) : null}
            {booking.status === "accepted" && booking.today === "not_started" ? (
              confirmingId === booking.id ? (
                <div className="space-y-2">
                  <p>¿Confirmas que esta persona no se presentó?</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      disabled={Boolean(busyId)}
                      onClick={() => markNoShow(booking.id)}
                    >
                      Sí, no se presentó
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={Boolean(busyId)}
                      onClick={() => setConfirmingId("")}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <Button
                    type="button"
                    variant="outline"
                    aria-disabled={!noShowOpen(booking.pickupAt, now)}
                    onClick={() => {
                      if (noShowOpen(booking.pickupAt, now)) setConfirmingId(booking.id);
                    }}
                  >
                    No se presentó
                  </Button>
                  {noShowOpen(booking.pickupAt, now) ? null : (
                    <p className="text-sm text-muted-foreground">
                      Podrás marcarlo 10 minutos después de la hora de recogida.
                    </p>
                  )}
                </div>
              )
            ) : null}
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm font-medium">
          {notice}
        </p>
      ) : null}
    </main>
  );
}

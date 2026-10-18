"use client";

import { useEffect, useState } from "react";

import ProfileAvatar from "@/components/profile-avatar";
import { Button } from "@/components/ui/button";
import { communitiesApi, type OfferBookingsResponse } from "@/lib/communities-api";

export default function BookingRequests({ offerId }: { offerId: string }) {
  const [result, setResult] = useState<OfferBookingsResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

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

  async function decide(bookingId: string, action: "accept" | "reject") {
    setBusyId(bookingId);
    setError("");
    setNotice("");
    try {
      if (action === "accept") {
        await communitiesApi.acceptBooking(bookingId);
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
      const message = (cause as { response?: { data?: { error?: unknown } } }).response?.data
        ?.error;
      setError(typeof message === "string" ? message : "No se pudo actualizar la solicitud.");
    } finally {
      setBusyId("");
    }
  }

  if (error && !result) return <p role="alert">{error}</p>;
  if (!result) return <p role="status">Cargando solicitudes…</p>;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-extrabold">Solicitudes</h1>
      <p>{`${result.seatsTaken} de ${result.seatsTotal} asientos ocupados`}</p>
      {result.bookings.length === 0 ? <p>Aún no hay solicitudes para este viaje.</p> : null}
      <ul className="space-y-3">
        {result.bookings.map((booking) => (
          <li key={booking.id} className="space-y-2 rounded-2xl border p-4">
            <div className="flex items-center gap-3">
              <ProfileAvatar
                name={booking.passengerName}
                photoUrl={booking.passengerPhotoUrl}
                className="size-10"
              />
              <h2 className="font-bold">{booking.passengerName} · Miembro verificado</h2>
            </div>
            <p>{`Punto de encuentro: ${booking.meetingPointName}`}</p>
            <p>{`Recogida ${booking.pickupAt}`}</p>
            <p>{`+${booking.detourMinutes} min de desvío`}</p>
            {booking.avoidsCar ? <p>Evita un viaje en auto</p> : null}
            {booking.recommended ? <p>Recomendado</p> : null}
            {booking.message ? <p>{`Mensaje: ${booking.message}`}</p> : null}
            {booking.status === "pending" ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={Boolean(busyId)}
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
          </li>
        ))}
      </ul>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
    </main>
  );
}

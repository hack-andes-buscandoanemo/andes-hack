"use client";

import { isAxiosError } from "axios";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import EmptyState from "@/components/empty-state";
import { FuelEstimateDetail } from "@/components/fuel-estimate";
import ShareTrip from "@/components/share-trip";
import SourceInfo from "@/components/source-info";
import ProfileAvatar from "@/components/profile-avatar";
import { Button } from "@/components/ui/button";
import { reasonOf } from "@/lib/api-error";
import { communitiesApi, type OfferDetail } from "@/lib/communities-api";

import { clockLabel, dateLabel, daysLabel } from "../../buscar/schedule";

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<OfferDetail | null>(null);
  const [message, setMessage] = useState("");
  const [sentId, setSentId] = useState<string | null>(null);
  const [withdrawn, setWithdrawn] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // A different trip starts from scratch: nothing from the previous one may leak in.
    setDetail(null);
    setLoadError(null);
    setError(null);
    setMessage("");
    setSentId(null);
    setWithdrawn(false);
    communitiesApi
      .getOfferDetail(id)
      .then((loaded) => {
        if (active) setDetail(loaded);
      })
      .catch((failure: unknown) => {
        if (!active) return;
        // 404 (unknown or another community's trip) and 422 (malformed id) read the same to the person.
        const status = isAxiosError(failure) ? failure.response?.status : undefined;
        setLoadError(
          status === 404 || status === 422
            ? "No encontramos este viaje."
            : "No pudimos cargar este viaje. Inténtalo de nuevo.",
        );
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (loadError) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-6">
        <p
          role="alert"
          className="rounded-2xl border bg-card p-4 text-sm font-medium text-destructive"
        >
          {loadError}
        </p>
      </main>
    );
  }
  if (!detail) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-6">
        <p role="status" className="text-sm text-muted-foreground">
          Cargando viaje…
        </p>
      </main>
    );
  }

  const pendingId = withdrawn
    ? null
    : (sentId ?? (detail.booking?.status === "pending" ? detail.booking.id : null));

  async function withdraw(bookingId: string) {
    setError(null);
    try {
      await communitiesApi.cancelBooking(bookingId);
      setSentId(null);
      setWithdrawn(true);
    } catch (failure) {
      setError(reasonOf(failure, "No pudimos retirar tu solicitud. Inténtalo de nuevo."));
    }
  }

  async function submit() {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const { booking } = await communitiesApi.requestSeat(id, message ? { message } : {});
      setSentId(booking.id);
      setWithdrawn(false);
    } catch (failure) {
      setError(reasonOf(failure, "No pudimos enviar tu solicitud. Inténtalo de nuevo."));
    } finally {
      setSending(false);
    }
  }

  let action: React.ReactNode = null;
  if (detail.isOwn) action = null;
  else if (detail.status !== "active")
    action = <EmptyState>Este viaje cambió y ya no es compatible con tu búsqueda.</EmptyState>;
  else if (detail.booking?.status === "accepted")
    action = <EmptyState>{`${detail.driverName} aceptó tu solicitud.`}</EmptyState>;
  else if (detail.booking?.status === "rejected")
    action = <EmptyState>El conductor no pudo aceptar tu solicitud.</EmptyState>;
  else if (pendingId)
    action = (
      <div className="space-y-2">
        <div role="status">
          <EmptyState>{`Solicitud enviada. Te avisaremos cuando ${detail.driverName} responda.`}</EmptyState>
        </div>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded-xl font-bold"
          onClick={() => void withdraw(pendingId)}
        >
          Retirar solicitud
        </Button>
      </div>
    );
  else if (detail.seatsFree <= 0)
    action = <EmptyState>Este viaje ya no tiene asientos libres.</EmptyState>;
  else if (!detail.hasOpenNeed)
    action = <EmptyState>Busca tu viaje antes de solicitar un asiento.</EmptyState>;
  else
    action = (
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {withdrawn ? <p className="text-sm font-medium">Retiraste tu solicitud.</p> : null}
        <label className="block space-y-1 text-sm font-medium">
          Mensaje para el conductor (opcional)
          <textarea
            value={message}
            maxLength={280}
            onChange={(event) => setMessage(event.target.value)}
            className="block w-full rounded-lg border border-input bg-background p-2 font-normal"
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={sending} className="h-11 w-full rounded-xl font-bold">
          {sending ? "Enviando…" : "Solicitar asiento"}
        </Button>
      </form>
    );

  const outbound = detail.direction === "outbound";
  const from = outbound ? detail.originZoneName : detail.destinationName;
  const to = outbound ? detail.destinationName : detail.originZoneName;
  const { match } = detail;
  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-4 py-6">
      <h1 className="text-2xl font-extrabold">Detalle del viaje</h1>
      <section className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <ProfileAvatar
          name={detail.driverName}
          photoUrl={detail.driverPhotoUrl}
          className="size-12"
        />
        <div>
          <p className="font-bold">{detail.driverName}</p>
          <p className="w-fit rounded-full bg-brand-yellow px-2.5 py-0.5 text-xs font-bold text-brand-black">
            Miembro verificado
          </p>
          <p className="text-xs text-muted-foreground">{detail.communityName}</p>
        </div>
      </section>
      <section className="space-y-1 rounded-2xl border bg-card p-4 shadow-sm">
        <p className="font-semibold">{`${from} → ${to}`}</p>
        {detail.daysOfWeek ? (
          <p className="text-sm">{`Viaje recurrente: ${daysLabel(detail.daysOfWeek)}`}</p>
        ) : detail.date ? (
          <p className="text-sm">{dateLabel(detail.date)}</p>
        ) : null}
        <p className="text-sm">{`Salida: ${clockLabel(detail.departureTime.slice(0, 5))}`}</p>
        {match ? (
          <>
            <p className="text-sm">
              {`Llegada estimada: ${clockLabel(match.arrivalAt)}`}
              <SourceInfo topic="tiempos" />
            </p>
            <div className="rounded-xl bg-brand-yellow/30 p-2 text-sm">
              <p className="text-xs font-bold">Tu punto de encuentro</p>
              <p>{match.meetingPointName}</p>
              <p>{`Recogida: ${clockLabel(match.pickupAt)}`}</p>
            </div>
          </>
        ) : null}
      </section>
      <section className="space-y-1 rounded-2xl border bg-card p-4 text-sm shadow-sm">
        <p>
          {detail.seatsFree === 1
            ? "1 asiento disponible"
            : `${detail.seatsFree} asientos disponibles`}
        </p>
        {match ? (
          <p>
            {`Desvío estimado: ${match.detourMinutes} min`}
            <SourceInfo topic="tiempos" />
          </p>
        ) : null}
        {detail.vehicle ? (
          <>
            <p>{`Vehículo: ${detail.vehicle.make} ${detail.vehicle.model}`}</p>
            <p>
              {detail.vehicle.plate
                ? `Placa: ${detail.vehicle.plate}`
                : "La placa se muestra cuando el conductor acepte."}
            </p>
          </>
        ) : null}
      </section>
      <FuelEstimateDetail estimate={detail.fuelEstimate} />
      <section className="space-y-2 rounded-2xl border bg-card p-4 text-sm shadow-sm">
        <h2 className="font-bold">Seguridad del viaje</h2>
        <ul className="space-y-1">
          <li>Miembro verificado</li>
          {detail.vehicle ? <li>Vehículo registrado</li> : null}
          {detail.vehicle ? <li>Info del vehículo disponible</li> : null}
        </ul>
        {detail.booking?.status === "accepted" && !withdrawn ? (
          <ShareTrip bookingId={detail.booking.id} label="Compartir detalles del viaje" />
        ) : null}
      </section>
      {detail.note ? (
        <section className="rounded-2xl border bg-card p-4 text-sm shadow-sm">
          <h2 className="font-bold">Nota del conductor</h2>
          <p>{detail.note}</p>
        </section>
      ) : null}
      {action}
      <EmptyState>
        <span className="block">Espera máxima: 3 min</span>
        <span className="block">Sin tarifa: Te Jalo no cobra</span>
        <span className="block">Puedes cancelar cuando quieras</span>
      </EmptyState>
    </main>
  );
}

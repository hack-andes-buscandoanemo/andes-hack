"use client";

import {
  ArrowLeft01Icon,
  CheckmarkBadge01Icon,
  CheckmarkCircle02Icon,
  Location01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { isAxiosError } from "axios";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { CancelTripDialog } from "@/components/cancel-trip-dialog";
import DropOffSuggestion, { type DropOff } from "@/components/drop-off-suggestion";
import EmptyState from "@/components/empty-state";
import IncidentReportForm from "@/components/incident-report-form";
import { FuelEstimateDetail } from "@/components/fuel-estimate";
import LiveTrip from "@/components/live-trip";
import ShareTrip from "@/components/share-trip";
import SourceInfo from "@/components/source-info";
import ProfileAvatar from "@/components/profile-avatar";
import RouteMap from "@/components/route-map";
import { Button, buttonVariants } from "@/components/ui/button";
import { LiveBadge, TripPrice } from "@/components/trip-price";
import { reasonOf } from "@/lib/api-error";
import { communitiesApi, type OfferDetail } from "@/lib/communities-api";
import type { Coordinates } from "@/lib/geo";

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
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [driverCancelled, setDriverCancelled] = useState(false);
  const [passengerCancelled, setPassengerCancelled] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [livePosition, setLivePosition] = useState<Coordinates | null>(null);
  const [dropOff, setDropOff] = useState<DropOff | null>(null);
  const [showIncidentReport, setShowIncidentReport] = useState(false);

  useEffect(() => {
    let active = true;
    // A different trip starts from scratch: nothing from the previous one may leak in.
    setDetail(null);
    setLoadError(null);
    setError(null);
    setMessage("");
    setSentId(null);
    setWithdrawn(false);
    setShowCancelDialog(false);
    setCancelSubmitting(false);
    setDriverCancelled(false);
    setPassengerCancelled(false);
    setShowAlternatives(false);
    setLivePosition(null);
    setDropOff(null);
    setShowIncidentReport(false);
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
      <main className="px-4 pt-2 pb-6">
        <p role="alert" className="surface p-5 text-sm font-medium text-destructive">
          {loadError}
        </p>
      </main>
    );
  }
  if (!detail) {
    return (
      <main className="px-4 pt-2 pb-6">
        <p role="status" className="text-sm text-muted-foreground">
          Cargando viaje…
        </p>
      </main>
    );
  }

  const pendingId = withdrawn
    ? null
    : (sentId ?? (detail.booking?.status === "pending" ? detail.booking.id : null));
  const canReport =
    detail.isOwn || ["accepted", "completed", "no_show"].includes(detail.booking?.status ?? "");

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

  function isLate(): boolean {
    if (!detail) return false;
    const timeStr = detail.match?.pickupAt ?? detail.departureTime;
    const [hours, minutes] = timeStr.slice(0, 5).split(":").map(Number);
    if (hours === undefined || minutes === undefined) return false;
    const now = new Date();
    const todayLima = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(now);
    let targetDateStr = detail.date;
    if (!targetDateStr && detail.daysOfWeek && detail.daysOfWeek.length > 0) {
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
      if (currentIsoDay && detail.daysOfWeek.includes(currentIsoDay)) {
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
  }

  let action: React.ReactNode = null;
  if (detail.isOwn) {
    if (detail.status === "cancelled" || driverCancelled) {
      action = <EmptyState>Cancelaste este viaje.</EmptyState>;
    } else {
      action = (
        <div className="space-y-3">
          <Link
            href={`/viajes/${id}/solicitudes`}
            className={buttonVariants({ size: "lg", className: "w-full" })}
          >
            Solicitudes
          </Link>
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            onClick={() => setShowCancelDialog(true)}
          >
            Cancelar viaje
          </Button>
          <CancelTripDialog
            isOpen={showCancelDialog}
            isLate={isLate()}
            submitting={cancelSubmitting}
            onConfirm={async () => {
              setCancelSubmitting(true);
              setError(null);
              try {
                await communitiesApi.cancelOffer(id);
                setDriverCancelled(true);
                setDetail((prev) => (prev ? { ...prev, status: "cancelled" } : null));
                setShowCancelDialog(false);
              } catch (failure) {
                setError(reasonOf(failure, "No pudimos cancelar tu viaje. Inténtalo de nuevo."));
              } finally {
                setCancelSubmitting(false);
              }
            }}
            onDismiss={() => setShowCancelDialog(false)}
          />
        </div>
      );
    }
  } else if (detail.booking?.status === "cancelled_by_driver") {
    action = (
      <div className="space-y-3">
        <EmptyState>{`${detail.driverName} canceló el viaje.`}</EmptyState>
        <p className="text-center text-sm font-medium">
          Te incluiremos en el próximo emparejamiento.
        </p>
        {detail.alternatives && detail.alternatives.length > 0 ? (
          <div className="space-y-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setShowAlternatives((prev) => !prev)}
            >
              {showAlternatives ? "Ocultar alternativas" : "Ver alternativas"}
            </Button>
            {showAlternatives ? (
              <div className="space-y-2 pt-2">
                <h3 className="text-sm font-semibold">Viajes alternativos disponibles</h3>
                {detail.alternatives.map((alt) => (
                  <div key={alt.offerId} className="space-y-1 surface p-5">
                    <p className="font-semibold">{alt.driverName}</p>
                    <p className="text-sm text-muted-foreground">{`Salida: ${alt.departureTime.slice(0, 5)} · ${alt.meetingPointName}`}</p>
                    <p className="text-xs text-muted-foreground">{`${alt.seatsFree} asientos libres`}</p>
                    <Link
                      href={`/viajes/${alt.offerId}`}
                      className="inline-block pt-1 text-sm font-semibold underline underline-offset-4"
                    >
                      Ver viaje
                    </Link>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  } else if (passengerCancelled) {
    action = <EmptyState>Cancelaste tu viaje.</EmptyState>;
  } else if (detail.booking?.status === "accepted") {
    action = (
      <div className="space-y-3">
        <EmptyState>{`${detail.driverName} aceptó tu solicitud.`}</EmptyState>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          variant="destructive"
          className="w-full"
          onClick={() => setShowCancelDialog(true)}
        >
          Cancelar viaje
        </Button>
        <CancelTripDialog
          isOpen={showCancelDialog}
          isLate={isLate()}
          submitting={cancelSubmitting}
          onConfirm={async () => {
            setCancelSubmitting(true);
            setError(null);
            try {
              await communitiesApi.cancelBooking(detail.booking!.id);
              setPassengerCancelled(true);
              setShowCancelDialog(false);
            } catch (failure) {
              setError(reasonOf(failure, "No pudimos cancelar tu viaje. Inténtalo de nuevo."));
            } finally {
              setCancelSubmitting(false);
            }
          }}
          onDismiss={() => setShowCancelDialog(false)}
        />
      </div>
    );
  } else if (detail.status !== "active")
    action = <EmptyState>Este viaje cambió y ya no es compatible con tu búsqueda.</EmptyState>;
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
          className="w-full"
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
            className="field font-normal"
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={sending} className="w-full">
          {sending ? "Enviando…" : "Solicitar asiento"}
        </Button>
      </form>
    );

  const outbound = detail.direction === "outbound";
  const from = outbound ? detail.originZoneName : detail.destinationName;
  const to = outbound ? detail.destinationName : detail.originZoneName;
  const { match } = detail;
  return (
    <main className="space-y-4 px-4 pt-2 pb-6">
      <div className="space-y-3">
        <Link
          href="/viajes"
          className="-ml-1 inline-flex min-h-9 items-center gap-1 rounded-lg px-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" aria-hidden />
          Viajes
        </Link>
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Detalle del viaje</h1>
      </div>
      <section className="flex items-center gap-4 surface p-5">
        <ProfileAvatar
          name={detail.driverName}
          photoUrl={detail.driverPhotoUrl}
          className="size-14"
        />
        <div className="min-w-0 space-y-0.5">
          <p className="text-lg font-semibold tracking-tight">{detail.driverName}</p>
          <p className="inline-flex items-center gap-1 text-sm font-medium text-success">
            <HugeiconsIcon icon={CheckmarkBadge01Icon} className="size-4" aria-hidden />
            Miembro verificado
          </p>
          <p className="text-[0.8125rem] text-muted-foreground">{detail.communityName}</p>
        </div>
      </section>
      <section className="space-y-3 surface p-5">
        <p className="text-[0.9375rem] font-semibold">{`${from} → ${to}`}</p>
        <RouteMap
          route={detail.routeMap}
          livePosition={livePosition}
          dropOff={dropOff}
          suggestRoute
        />
        <div className="space-y-1 text-sm">
          {detail.daysOfWeek ? (
            <p className="text-muted-foreground">{`Viaje recurrente: ${daysLabel(detail.daysOfWeek)}`}</p>
          ) : detail.date ? (
            <p className="text-muted-foreground">{dateLabel(detail.date)}</p>
          ) : null}
          <p className="font-medium tabular-nums">{`Salida: ${clockLabel(detail.departureTime.slice(0, 5))}`}</p>
          {match ? (
            <p className="tabular-nums">
              {`Llegada estimada: ${clockLabel(match.arrivalAt)}`}
              <SourceInfo topic="tiempos" />
            </p>
          ) : null}
        </div>
        {match ? (
          <div className="flex gap-3 rounded-xl bg-highlight p-4 text-sm text-highlight-foreground">
            <HugeiconsIcon icon={Location01Icon} className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold tracking-wide uppercase">Tu punto de encuentro</p>
              <p className="font-medium">{match.meetingPointName}</p>
              <p className="tabular-nums">{`Recogida: ${clockLabel(match.pickupAt)}`}</p>
            </div>
          </div>
        ) : null}
      </section>
      <LiveTrip
        offerId={detail.offerId}
        priceCents={detail.priceCents}
        paymentMethods={detail.paymentMethods}
        role={
          detail.isOwn
            ? "driver"
            : detail.booking?.status === "accepted" && !withdrawn && !passengerCancelled
              ? "passenger"
              : "viewer"
        }
        onPosition={setLivePosition}
      />
      {detail.isOwn ? null : <DropOffSuggestion route={detail.routeMap} onSuggest={setDropOff} />}
      <section className="space-y-1.5 surface p-5 text-sm">
        {detail.live ? <LiveBadge /> : null}
        <TripPrice priceCents={detail.priceCents} paymentMethods={detail.paymentMethods} />
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
      <section className="space-y-2 surface p-5 text-sm">
        <h2 className="text-base font-semibold tracking-tight">Seguridad del viaje</h2>
        <ul className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <li className="inline-flex items-center gap-1.5">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              className="size-4 text-success"
              aria-hidden
            />
            Miembro verificado
          </li>
          {detail.vehicle ? (
            <li className="inline-flex items-center gap-1.5">
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                className="size-4 text-success"
                aria-hidden
              />
              Vehículo registrado
            </li>
          ) : null}
          {detail.vehicle ? (
            <li className="inline-flex items-center gap-1.5">
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                className="size-4 text-success"
                aria-hidden
              />
              Info del vehículo disponible
            </li>
          ) : null}
          {detail.booking?.status === "accepted" && !withdrawn ? (
            <li className="contents">
              <ShareTrip tile bookingId={detail.booking.id} label="Compartir detalles del viaje" />
            </li>
          ) : (
            <li className="flex w-full flex-col gap-1">
              <Button
                type="button"
                variant="outline"
                disabled
                aria-describedby="share-unavailable"
                className="w-full whitespace-normal"
              >
                Compartir detalles del viaje
              </Button>
              <span id="share-unavailable" className="text-xs text-muted-foreground">
                Disponible cuando el conductor acepte tu solicitud.
              </span>
            </li>
          )}
        </ul>
      </section>
      {detail.note ? (
        <section className="surface p-5 text-sm">
          <h2 className="text-base font-semibold tracking-tight">Nota del conductor</h2>
          <p>{detail.note}</p>
        </section>
      ) : null}
      {canReport ? (
        showIncidentReport ? (
          <IncidentReportForm
            offerId={id}
            reportedUsers={detail.reportTargets}
            onCancel={() => setShowIncidentReport(false)}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setShowIncidentReport(true)}
          >
            Reportar
          </Button>
        )
      ) : null}
      {action}
      <p className="space-y-1 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
        <span className="block">Espera máxima: 3 min</span>
        <span className="block">Te Jalo no cobra: el pago se hace con el conductor</span>
        <span className="block">Puedes cancelar cuando quieras</span>
      </p>
    </main>
  );
}

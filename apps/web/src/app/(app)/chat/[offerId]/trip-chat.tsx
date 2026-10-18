"use client";

import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import ProfileAvatar from "@/components/profile-avatar";
import IncidentReportForm from "@/components/incident-report-form";
import { Button } from "@/components/ui/button";
import {
  communitiesApi,
  type TripMessage,
  type TripMessagePayload,
  type TripMessagesResponse,
} from "@/lib/communities-api";

import { clockLabel } from "../../buscar/schedule";

const quickMessages = [
  "Ya salí",
  "Estoy en el punto de encuentro",
  "Llego en 5 min",
  "Hoy no podré ir",
] as const;
const weekdays = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export default function TripChat({ offerId }: { offerId: string }) {
  const [chat, setChat] = useState<TripMessagesResponse["conversation"] | null>(null);
  const [messages, setMessages] = useState<TripMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sendError, setSendError] = useState(false);
  const [failedMessage, setFailedMessage] = useState<TripMessagePayload | null>(null);
  const [sending, setSending] = useState(false);
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(null);
  const cursor = useRef<string | undefined>(undefined);
  const hasChat = useRef(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await communitiesApi.getTripMessages(offerId, cursor.current);
        if (!active) return;
        hasChat.current = true;
        setChat(result.conversation);
        setMessages((current) =>
          cursor.current ? [...current, ...result.messages] : result.messages,
        );
        cursor.current = result.messages.at(-1)?.id ?? cursor.current;
        setLoadError("");
      } catch {
        if (active && !hasChat.current) setLoadError("No pudimos cargar el chat.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 7000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [offerId]);

  async function send(message: TripMessagePayload) {
    const body = message.body.trim();
    if (!body || sending) return;
    const payload: TripMessagePayload = message.kind === "text" ? { kind: "text", body } : message;
    setSending(true);
    setSendError(false);
    try {
      const result = await communitiesApi.sendTripMessage(offerId, payload);
      setMessages((current) => [...current, result.message]);
      cursor.current = result.message.id;
      setDraft("");
      setFailedMessage(null);
    } catch {
      setSendError(true);
      setFailedMessage(payload);
    } finally {
      setSending(false);
    }
  }

  if (loading)
    return (
      <p role="status" className="px-4 pt-2 text-sm text-muted-foreground">
        Cargando chat…
      </p>
    );
  if (loadError || !chat)
    return (
      <p role="alert" className="px-4 pt-2 text-sm text-destructive">
        {loadError || "No pudimos cargar el chat."}
      </p>
    );

  const days = chat.daysOfWeek?.map((day) => weekdays[day - 1]).join(", ");
  const schedule = chat.date
    ? `${chat.date} · ${clockLabel(chat.departureTime.slice(0, 5))}`
    : `${days} · ${clockLabel(chat.departureTime.slice(0, 5))}`;

  return (
    <main className="flex flex-col gap-4 px-4 pt-2 pb-6">
      <header className="space-y-3">
        <Link
          href="/chat"
          className="-ml-1 inline-flex min-h-9 items-center gap-1 rounded-lg px-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" aria-hidden />
          Chat del viaje
        </Link>
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{`${chat.origin} → ${chat.destination}`}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <p className="text-muted-foreground tabular-nums">{schedule}</p>
          {chat.date ? null : (
            <p className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
              Grupo recurrente
            </p>
          )}
          <p className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
            Salida confirmada
          </p>
        </div>
      </header>
      <section aria-label="Participantes" className="space-y-3 surface p-5">
        <h2 className="text-base font-semibold tracking-tight">{`${chat.participants.length} participantes`}</h2>
        <ul className="space-y-2">
          {chat.participants.map((participant) => (
            <li
              key={`${participant.role}-${participant.name}`}
              className="flex items-center gap-3 text-sm"
            >
              <ProfileAvatar
                name={participant.name}
                photoUrl={participant.photoUrl}
                className="size-8"
              />
              <span>
                {participant.name} · {participant.role === "driver" ? "Conductor" : "Pasajero"}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {chat.meetingPoints.map((point) => (
        <section key={point.participantName} className="surface p-5">
          <h2 className="text-base font-semibold tracking-tight">{`Punto de encuentro acordado: ${point.name}`}</h2>
          <p className="text-sm text-muted-foreground">{`Ver punto de encuentro: ${point.participantName}`}</p>
        </section>
      ))}
      <section aria-label="Mensajes" className="space-y-3 surface p-5">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay mensajes. Saluda a tu compañero de viaje.
          </p>
        ) : (
          <ol className="space-y-4">
            {messages.map((message) => (
              <li
                key={message.id}
                className={`flex flex-col gap-2 ${message.isOwn ? "items-end" : "items-start"}`}
              >
                <div
                  className={`flex max-w-[85%] items-end gap-2 ${message.isOwn ? "flex-row-reverse" : ""}`}
                >
                  <ProfileAvatar
                    name={message.senderName}
                    photoUrl={message.senderPhotoUrl}
                    className="size-8"
                  />
                  <div
                    className={`space-y-0.5 rounded-2xl px-3.5 py-2.5 text-sm ${
                      message.isOwn
                        ? "rounded-br-md bg-brand-yellow text-brand-black"
                        : "rounded-bl-md bg-muted"
                    }`}
                  >
                    <p className="text-xs font-semibold">
                      {message.senderName} {message.senderRole === "driver" ? "· Conductor" : ""}
                    </p>
                    <p className="text-[0.9375rem]">{message.body}</p>
                    <time
                      dateTime={message.createdAt}
                      className="block text-[0.6875rem] opacity-70"
                    >
                      {new Date(message.createdAt).toLocaleTimeString("es-PE", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "America/Lima",
                      })}
                    </time>
                  </div>
                </div>
                {!message.isOwn &&
                  (reportingMessageId === message.id ? (
                    <IncidentReportForm
                      offerId={offerId}
                      messageId={message.id}
                      onCancel={() => setReportingMessageId(null)}
                    />
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="ml-10 text-muted-foreground"
                      onClick={() => setReportingMessageId(message.id)}
                    >
                      Reportar mensaje
                    </Button>
                  ))}
              </li>
            ))}
          </ol>
        )}
      </section>
      <div className="flex flex-wrap gap-2" aria-label="Mensajes rápidos">
        {quickMessages.map((quickMessage) => (
          <Button
            key={quickMessage}
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={sending}
            onClick={() => void send({ kind: "quick", body: quickMessage })}
          >
            {quickMessage}
          </Button>
        ))}
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send({ kind: "text", body: draft });
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Escribe un mensaje
          <textarea
            maxLength={500}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="field min-h-20 font-normal"
          />
        </label>
        <Button type="submit" disabled={sending || !draft.trim()}>
          {sending ? "Enviando…" : "Enviar"}
        </Button>
      </form>
      {sendError ? (
        <div role="alert" className="flex items-center gap-3 text-sm text-destructive">
          <p>No se pudo enviar.</p>
          <Button
            type="button"
            variant="outline"
            disabled={!failedMessage || sending}
            onClick={() => failedMessage && void send(failedMessage)}
          >
            Reintentar
          </Button>
        </div>
      ) : null}
    </main>
  );
}

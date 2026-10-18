"use client";

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

  if (loading) return <p role="status">Cargando chat…</p>;
  if (loadError || !chat) return <p role="alert">{loadError || "No pudimos cargar el chat."}</p>;

  const days = chat.daysOfWeek?.map((day) => weekdays[day - 1]).join(", ");
  const schedule = chat.date
    ? `${chat.date} · ${clockLabel(chat.departureTime.slice(0, 5))}`
    : `${days} · ${clockLabel(chat.departureTime.slice(0, 5))}`;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">Chat del viaje</p>
        <h1 className="text-2xl font-extrabold">{`${chat.origin} → ${chat.destination}`}</h1>
        <p>{schedule}</p>
        {chat.date ? null : <p>Grupo recurrente</p>}
        <p>Salida confirmada</p>
      </header>
      <section aria-label="Participantes" className="rounded-2xl border p-4">
        <h2 className="font-bold">{`${chat.participants.length} participantes`}</h2>
        <ul>
          {chat.participants.map((participant) => (
            <li key={`${participant.role}-${participant.name}`} className="flex items-center gap-2">
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
        <section key={point.participantName} className="rounded-2xl border p-4">
          <h2 className="font-bold">{`Punto de encuentro acordado: ${point.name}`}</h2>
          <p>{`Ver punto de encuentro: ${point.participantName}`}</p>
        </section>
      ))}
      <section aria-label="Mensajes" className="space-y-3 rounded-2xl border p-4">
        {messages.length === 0 ? (
          <p>Aún no hay mensajes. Saluda a tu compañero de viaje.</p>
        ) : (
          <ol className="space-y-3">
            {messages.map((message) => (
              <li key={message.id} className="space-y-2 rounded-xl bg-muted p-3">
                <div className="flex items-start gap-2">
                  <ProfileAvatar
                    name={message.senderName}
                    photoUrl={message.senderPhotoUrl}
                    className="size-8"
                  />
                  <div>
                    <p className="font-bold">
                      {message.senderName} {message.senderRole === "driver" ? "· Conductor" : ""}
                    </p>
                    <p>{message.body}</p>
                    <time dateTime={message.createdAt} className="text-xs text-muted-foreground">
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
                      variant="outline"
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
        <label className="flex flex-col gap-1 font-bold">
          Escribe un mensaje
          <textarea
            maxLength={500}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-20 rounded-xl border bg-background p-3 font-normal"
          />
        </label>
        <Button type="submit" disabled={sending || !draft.trim()}>
          {sending ? "Enviando…" : "Enviar"}
        </Button>
      </form>
      {sendError ? (
        <div role="alert" className="flex items-center gap-2">
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

"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { reasonOf } from "@/lib/api-error";
import { communitiesApi } from "@/lib/communities-api";

// Gives a trusted person a private link to follow one accepted seat (US-028).
export default function ShareTrip({
  bookingId,
  label,
  tile = false,
}: {
  bookingId: string;
  label: string;
  // Sits among the safety items as a tile; the link panel takes the whole row once open.
  tile?: boolean;
}) {
  const [shared, setShared] = useState<{ id: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [stopped, setStopped] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function share() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const link = await communitiesApi.createShareLink(bookingId);
      setStopped(false);
      setCopied(false);
      setShared({ id: link.id, url: `${window.location.origin}/compartido/${link.token}` });
    } catch (failure) {
      setError(reasonOf(failure, "No pudimos crear el enlace. Inténtalo de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!shared) return;
    try {
      await navigator.clipboard.writeText(shared.url);
      setError(null);
      setCopied(true);
    } catch {
      // No clipboard permission or insecure context: select the text so it can be copied by hand.
      setCopied(false);
      setError("No pudimos copiar el enlace. Cópialo manualmente.");
      input.current?.select();
    }
  }

  async function stop() {
    if (!shared || busy) return;
    setBusy(true);
    setError(null);
    try {
      await communitiesApi.revokeShareLink(shared.id);
      setShared(null);
      setStopped(true);
    } catch (failure) {
      setError(reasonOf(failure, "No pudimos dejar de compartir. Inténtalo de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!shared) return;
    try {
      await navigator.share({
        title: "Mi viaje en Te Jalo",
        text: "Sigue mi viaje:",
        url: shared.url,
      });
    } catch {
      // Closing the share sheet rejects; the link is still on screen to copy.
    }
  }

  return (
    <div className={tile && shared ? "w-full basis-full space-y-2" : "space-y-2"}>
      {shared ? (
        <>
          <label className="block space-y-1 text-sm font-medium">
            Enlace para compartir
            <input ref={input} readOnly value={shared.url} className="field font-normal" />
          </label>
          <p className="text-xs text-muted-foreground">
            El enlace vence al final del día del viaje.
          </p>
          {typeof navigator.share === "function" ? (
            <Button type="button" onClick={() => void send()}>
              Enviar enlace
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => void copy()}>
            Copiar enlace
          </Button>
          {copied ? <p role="status">Enlace copiado.</p> : null}
          <Button type="button" variant="outline" disabled={busy} onClick={() => void stop()}>
            Dejar de compartir
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          className={
            tile ? "h-auto flex-col rounded-2xl px-3 py-2 text-center whitespace-normal" : undefined
          }
          disabled={busy}
          onClick={() => void share()}
        >
          {label}
        </Button>
      )}
      {stopped ? <p role="status">Dejaste de compartir este viaje.</p> : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

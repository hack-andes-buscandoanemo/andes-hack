"use client";

import type { VoiceSearchResponse } from "@andes-hack/api";
import { Mic01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";

import { dictateSearch, VoiceError } from "@/lib/voice-api";

// One sentence is enough for a search; the recording stops by itself after this long.
const MAX_SECONDS = 30;

type Phase = "idle" | "recording" | "processing";

interface Notice {
  heard?: string;
  notes: string[];
  error?: string;
}

// The recorder formats the browsers can play and Whisper accepts, best first.
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

// A floating microphone: tap, say the whole search ("de Parque Kennedy a la sede, mañana a las
// siete y media"), tap again, and the form fills in. Whisper transcribes on the server; this
// button only records and reports what was understood.
export default function VoiceFab({
  headquarters,
  onResult,
}: {
  headquarters?: string;
  // Applies what was said to the form and returns what it did, one line each.
  onResult: (result: VoiceSearchResponse) => Promise<string[]>;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsed = useRef(0);

  function release() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }

  // Leaving the screen closes the microphone.
  useEffect(
    () => () => {
      if (recorder.current && recorder.current.state !== "inactive") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      release();
    },
    [],
  );

  async function process(audio: Blob) {
    setPhase("processing");
    try {
      const result = await dictateSearch(audio, headquarters);
      const notes = await onResult(result);
      setNotice({ heard: result.text, notes });
    } catch (failure) {
      setNotice({
        notes: [],
        error:
          failure instanceof VoiceError
            ? failure.message
            : "No pudimos completar los campos. Inténtalo de nuevo.",
      });
    } finally {
      setPhase("idle");
    }
  }

  async function start() {
    setNotice(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setNotice({ notes: [], error: "Tu navegador no permite grabar audio." });
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNotice({
        notes: [],
        error: "Permite el acceso al micrófono para dictar tu búsqueda.",
      });
      return;
    }
    const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    const chunks: Blob[] = [];
    const next = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    next.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    next.onstop = () => {
      release();
      void process(new Blob(chunks, { type: next.mimeType || mimeType || "audio/webm" }));
    };
    recorder.current = next;
    next.start();
    elapsed.current = 0;
    setSeconds(0);
    setPhase("recording");
    timer.current = setInterval(() => {
      elapsed.current += 1;
      setSeconds(elapsed.current);
      if (elapsed.current >= MAX_SECONDS) stop();
    }, 1_000);
  }

  function stop() {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }

  const recording = phase === "recording";
  const processing = phase === "processing";
  const label = recording
    ? "Detener y completar los campos"
    : processing
      ? "Procesando tu voz"
      : "Completar los campos por voz";

  return (
    <>
      {notice || recording || processing ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 bottom-[calc(10.5rem+env(safe-area-inset-bottom))] left-4 z-30 ml-auto max-w-xs space-y-1 rounded-2xl border bg-card p-3 text-sm shadow-lg"
        >
          {recording ? (
            <p className="font-semibold">{`Escuchando… ${seconds} s. Toca para terminar.`}</p>
          ) : null}
          {processing ? <p className="font-semibold">Entendiendo lo que dijiste…</p> : null}
          {!recording && !processing && notice ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">
                  {notice.error ? "No pudimos completar la búsqueda" : "Completé tu búsqueda"}
                </p>
                <button
                  type="button"
                  aria-label="Cerrar"
                  className="px-1 text-lg leading-none text-muted-foreground"
                  onClick={() => setNotice(null)}
                >
                  ×
                </button>
              </div>
              {notice.error ? <p className="font-medium text-destructive">{notice.error}</p> : null}
              {notice.heard ? (
                <p className="text-muted-foreground">{`Escuché: “${notice.heard}”`}</p>
              ) : null}
              {notice.notes.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-4">
                  {notice.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        aria-label={label}
        aria-pressed={recording}
        disabled={processing}
        onClick={recording ? stop : () => void start()}
        className={`fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 disabled:opacity-80 ${
          recording ? "bg-destructive text-white" : "bg-brand-yellow text-brand-black"
        }`}
      >
        {recording ? (
          <>
            <span
              aria-hidden
              className="absolute inset-0 animate-ping rounded-full bg-destructive/50"
            />
            <span aria-hidden className="relative size-4 rounded-sm bg-white" />
          </>
        ) : processing ? (
          <span
            aria-hidden
            className="size-6 animate-spin rounded-full border-2 border-brand-black border-t-transparent"
          />
        ) : (
          <HugeiconsIcon icon={Mic01Icon} className="size-6" aria-hidden />
        )}
      </button>
    </>
  );
}

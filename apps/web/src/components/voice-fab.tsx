"use client";

import { Mic01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";

import { VoiceError } from "@/lib/voice-api";

// One or two sentences fill a form; the recording stops by itself after this long.
const MAX_SECONDS = 30;
// Shorter than this is a mis-tap, not a sentence.
const MIN_MS = 1_000;
// Level (0 to 1) under which the microphone is taken as silent.
const SILENCE = 0.02;
// Seconds of silence after which the person is told the microphone hears nothing.
const SILENT_HINT_AFTER = 3;
const BARS = [0.55, 0.9, 1, 0.8, 0.6];

type Phase = "idle" | "recording" | "processing";

interface Notice {
  heard?: string;
  notes: string[];
  error?: string;
}

// The recorder formats the browsers can play and Whisper accepts, best first.
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

// A floating microphone that fills a whole form from what the person says. Three states, always
// written on the button: "Dictar" (off), "Grabando" (on: it pulses, its bars follow the voice
// and it counts the time) and "Procesando". Whisper transcribes on the server; this button
// only records, and reports what the page understood.
export default function VoiceFab({
  process,
  hint,
}: {
  // Sends the recording to the server and applies the fields to the form; returns what was
  // heard and what it filled, one line each.
  process: (audio: Blob) => Promise<{ heard: string; notes: string[] }>;
  // An example of what to say, shown while the button is off.
  hint?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [silent, setSilent] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const frame = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const peak = useRef(0);
  // The latest `process`: the recording ends long after the render that started it.
  const latest = useRef(process);
  latest.current = process;

  function release() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    void audioContext.current?.close().catch(() => undefined);
    audioContext.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setLevel(0);
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

  async function finish(audio: Blob) {
    setPhase("processing");
    try {
      const { heard, notes } = await latest.current(audio);
      setNotice({ heard, notes });
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

  // The live level of the microphone: what makes the button show that it really hears.
  function watchLevel(source: MediaStream) {
    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    context.createMediaStreamSource(source).connect(analyser);
    audioContext.current = context;
    const samples = new Uint8Array(analyser.fftSize);
    let last = 0;
    const tick = (now: number) => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
      const rms = Math.min(1, Math.sqrt(sum / samples.length) * 4);
      peak.current = Math.max(peak.current, rms);
      // About fifteen redraws a second are enough to look alive.
      if (now - last > 66) {
        last = now;
        setLevel(rms);
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }

  async function start() {
    setNotice(null);
    setSilent(false);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setNotice({ notes: [], error: "Tu navegador no permite grabar audio." });
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNotice({ notes: [], error: "Permite el acceso al micrófono para dictar." });
      return;
    }
    const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    const chunks: Blob[] = [];
    let next: MediaRecorder;
    try {
      next = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    } catch {
      release();
      setNotice({ notes: [], error: "No pudimos iniciar la grabación en este navegador." });
      return;
    }
    next.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    next.onerror = () => {
      release();
      setPhase("idle");
      setNotice({ notes: [], error: "Se interrumpió la grabación. Inténtalo de nuevo." });
    };
    next.onstop = () => {
      const long = Date.now() - startedAt.current >= MIN_MS;
      release();
      if (!long || chunks.length === 0) {
        setPhase("idle");
        setNotice({
          notes: [],
          error: "Fue muy corto. Toca, di todo lo que quieres y toca de nuevo.",
        });
        return;
      }
      void finish(new Blob(chunks, { type: next.mimeType || mimeType || "audio/webm" }));
    };
    recorder.current = next;
    peak.current = 0;
    startedAt.current = Date.now();
    next.start();
    watchLevel(stream.current);
    navigator.vibrate?.(30);
    setSeconds(0);
    setPhase("recording");
    timer.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1_000);
      setSeconds(elapsed);
      if (elapsed >= SILENT_HINT_AFTER && peak.current < SILENCE) setSilent(true);
      else if (peak.current >= SILENCE) setSilent(false);
      if (elapsed >= MAX_SECONDS) stop();
    }, 500);
  }

  function stop() {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }

  const recording = phase === "recording";
  const processing = phase === "processing";

  return (
    <div className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex max-w-[min(20rem,calc(100vw-2rem))] flex-col items-end gap-2">
      {/* What is on: one line that says it, read aloud too. */}
      <div role="status" aria-live="polite" className="w-full space-y-1">
        {recording ? (
          <p
            className={`rounded-2xl border border-destructive bg-card p-3 text-sm font-semibold shadow-lg ${
              silent ? "text-destructive" : ""
            }`}
          >
            {silent
              ? "No te escucho: acércate al micrófono o revisa que no esté silenciado."
              : "Te estoy escuchando. Di todo lo que quieres completar y toca para enviar."}
          </p>
        ) : null}
        {processing ? (
          <p className="rounded-2xl border bg-card p-3 text-sm font-semibold shadow-lg">
            Entendiendo lo que dijiste y completando los campos…
          </p>
        ) : null}
        {!recording && !processing && notice ? (
          <div className="space-y-1 rounded-2xl border bg-card p-3 text-sm shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">
                {notice.error ? "No pudimos completar los campos" : "Completé los campos"}
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
          </div>
        ) : null}
        {!recording && !processing && !notice && hint ? (
          <p className="rounded-2xl border bg-card/95 p-2 text-xs text-muted-foreground shadow">
            {`Prueba diciendo: ${hint}`}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        aria-label={
          recording
            ? "Dictado activado: toca para enviar"
            : processing
              ? "Procesando tu voz"
              : "Dictado desactivado: toca para completar los campos por voz"
        }
        aria-pressed={recording}
        disabled={processing}
        onClick={recording ? stop : () => void start()}
        className={`relative flex h-14 items-center gap-3 rounded-full px-5 font-bold shadow-lg transition-colors active:scale-95 disabled:opacity-90 ${
          recording ? "bg-destructive text-white" : "bg-brand-yellow text-brand-black"
        }`}
      >
        {recording ? (
          <>
            {/* A ring that breathes with the voice: the button is on and hears. */}
            <span
              aria-hidden
              className="absolute inset-0 -z-10 rounded-full bg-destructive/60 motion-safe:animate-ping"
            />
            <span
              aria-hidden
              className="absolute -inset-1 -z-10 rounded-full bg-destructive/40 transition-transform duration-75"
              style={{ transform: `scale(${1 + level * 0.25})` }}
            />
            <span aria-hidden className="flex h-6 items-center gap-0.5">
              {BARS.map((base, index) => (
                <span
                  key={index}
                  className="w-1 rounded-full bg-white transition-[height] duration-75"
                  style={{
                    height: `${Math.round((0.25 + Math.min(1, level * base * 1.6)) * 24)}px`,
                  }}
                />
              ))}
            </span>
            <span className="text-sm">{`Grabando ${clock(seconds)} · Enviar`}</span>
          </>
        ) : processing ? (
          <>
            <span
              aria-hidden
              className="size-5 rounded-full border-2 border-brand-black border-t-transparent motion-safe:animate-spin"
            />
            <span className="text-sm">Procesando…</span>
          </>
        ) : (
          <>
            <HugeiconsIcon icon={Mic01Icon} className="size-6" aria-hidden />
            <span className="text-sm">Dictar</span>
          </>
        )}
      </button>
    </div>
  );
}

import { VoiceSearchFieldsSchema } from "@andes-hack/api";
import { env } from "@andes-hack/env/server";
import { Hono } from "hono";
import type { z } from "zod";

import { logEvent } from "./lib/logger";
import { requireSession, type SessionResolver } from "./middleware";
import { ApiError } from "./utils/api-response";
import { errorHandler } from "./utils/error-handler";

export type VoiceFields = z.infer<typeof VoiceSearchFieldsSchema>;

// Speech to text, from an audio file the person recorded.
export type Transcriber = (audio: File) => Promise<string>;
// The fields of the search form a sentence says; `today` is the Lima date, `headquarters` the
// place "la sede" or "la oficina" stands for.
export type FieldExtractor = (input: {
  text: string;
  today: string;
  weekday: string;
  headquarters: string | null;
}) => Promise<unknown>;

const OPENAI = "https://api.openai.com/v1";
const TIMEOUT_MS = 30_000;
// About thirty seconds of speech; the API accepts far more, but a search is one sentence.
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

const notConfigured = () =>
  new ApiError(503, "La voz no está configurada: falta OPENAI_API_KEY en el servidor.", {
    code: "voice_not_configured",
  });

// The provider's reason stays in the log; the person only learns that it failed.
function providerFailure(step: string, status: number) {
  logEvent("voice.provider_error", { step, status });
  return new ApiError(502, "No pudimos procesar tu voz ahora. Inténtalo de nuevo.", {
    code: "voice_provider_error",
  });
}

// OpenAI Whisper: https://platform.openai.com/docs/api-reference/audio/createTranscription
export const whisperTranscriber: Transcriber = async (audio) => {
  if (!env.OPENAI_API_KEY) throw notConfigured();
  const form = new FormData();
  form.append("file", audio, audio.name || "voz.webm");
  form.append("model", "whisper-1");
  form.append("language", "es");
  // Names Whisper tends to mishear in this app's domain.
  form.append(
    "prompt",
    "Búsqueda de un viaje compartido en Lima, Perú. Distritos: San Isidro, Miraflores, La Molina, Surco, San Borja, Barranco. Avenidas: Javier Prado, Arequipa, Benavides, Angamos.",
  );
  const response = await fetch(`${OPENAI}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw providerFailure("whisper", response.status);
  const body = (await response.json()) as { text?: string };
  return (body.text ?? "").trim();
};

const FIELDS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "origin",
    "originIsCurrentLocation",
    "destination",
    "when",
    "date",
    "days",
    "windowStart",
    "windowEnd",
    "womenOnly",
    "fallbackMode",
  ],
  properties: {
    origin: { type: ["string", "null"] },
    originIsCurrentLocation: { type: "boolean" },
    destination: { type: ["string", "null"] },
    when: { type: ["string", "null"], enum: ["today", "tomorrow", "date", "weekdays", null] },
    date: { type: ["string", "null"] },
    days: { type: "array", items: { type: "integer", minimum: 1, maximum: 7 } },
    windowStart: { type: ["string", "null"] },
    windowEnd: { type: ["string", "null"] },
    womenOnly: { type: ["boolean", "null"] },
    fallbackMode: {
      type: ["string", "null"],
      enum: ["drive_alone", "taxi_app", "public_transport", "picked_up", "other", null],
    },
  },
} as const;

const instructions = (input: { today: string; weekday: string; headquarters: string | null }) =>
  [
    "Extraes los campos de un formulario de búsqueda de viaje compartido en Lima, Perú, a partir de lo que dijo la persona.",
    `Hoy es ${input.weekday} ${input.today} (hora de Lima).`,
    "Usa null en lo que la persona no dijo; nunca inventes datos.",
    '- origin: el lugar o dirección desde donde sale, tal como lo dijo (ej. "Parque Kennedy, Miraflores"). Si dice "aquí", "donde estoy" o "mi ubicación", deja origin en null y pon originIsCurrentLocation en true.',
    input.headquarters
      ? `- destination: el lugar o dirección a donde va. Si dice "la sede", "la oficina" o "el trabajo", usa "${input.headquarters}".`
      : "- destination: el lugar o dirección a donde va.",
    '- when: "today" (hoy), "tomorrow" (mañana), "date" (una fecha concreta, con date en YYYY-MM-DD) o "weekdays" (días que se repiten, con days: 1 = lunes … 7 = domingo; "de lunes a viernes" es [1,2,3,4,5]).',
    "- windowStart y windowEnd: el rango de salida en formato HH:MM de 24 horas. Si dice una sola hora, windowStart es esa hora y windowEnd una hora después. Si dice una hora sin am/pm, supón la más probable para ir o volver del trabajo.",
    "- womenOnly: true si pide viajar solo con mujeres; null si no lo menciona.",
    '- fallbackMode: cómo iría si no encuentra viaje: "drive_alone" (en su auto), "taxi_app" (taxi o app), "public_transport" (bus, combi, metro), "picked_up" (lo recogen), "other"; null si no lo dijo.',
  ].join("\n");

// An OpenAI chat model with a strict JSON schema, so the answer is always the form's fields.
export const openAiExtractor: FieldExtractor = async (input) => {
  if (!env.OPENAI_API_KEY) throw notConfigured();
  const response = await fetch(`${OPENAI}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_PARSE_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: instructions(input) },
        { role: "user", content: input.text },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "trip_search_fields", strict: true, schema: FIELDS_JSON_SCHEMA },
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw providerFailure("extract", response.status);
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw providerFailure("extract", 200);
  return JSON.parse(content);
};

export interface VoiceDeps {
  getSession?: SessionResolver;
  now?: () => Date;
  transcribe?: Transcriber;
  extract?: FieldExtractor;
}

// Calendar date and weekday in Lima (UTC−5, no daylight saving time).
function limaToday(now: Date) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(now);
  const weekday = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    weekday: "long",
  }).format(now);
  return { date, weekday };
}

// POST /voice/search: a recording of the person saying their search, as the fields of the
// form. The key of OpenAI never leaves the server.
export function createVoiceRoutes(deps: VoiceDeps = {}) {
  const app = new Hono();
  app.onError(errorHandler);
  const getNow = deps.now ?? (() => new Date());
  const transcribe = deps.transcribe ?? whisperTranscriber;
  const extract = deps.extract ?? openAiExtractor;

  app.use("/voice/*", requireSession(deps.getSession));
  app.post("/voice/search", async (c) => {
    if (!deps.transcribe && !env.OPENAI_API_KEY) throw notConfigured();

    const form = await c.req.formData().catch(() => null);
    const audio = form?.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      throw new ApiError(422, "Graba tu búsqueda para enviarla.", { code: "audio_required" });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      throw new ApiError(413, "La grabación es muy larga. Di tu búsqueda en unos segundos.", {
        code: "audio_too_large",
      });
    }
    const headquarters = form?.get("headquarters");

    const text = (await transcribe(audio)).trim();
    if (!text) {
      throw new ApiError(
        422,
        "No te escuchamos. Habla más cerca del micrófono e inténtalo de nuevo.",
        {
          code: "no_speech",
        },
      );
    }

    const { date, weekday } = limaToday(getNow());
    const raw = await extract({
      text,
      today: date,
      weekday,
      headquarters:
        typeof headquarters === "string" && headquarters.trim()
          ? headquarters.trim().slice(0, 120)
          : null,
    });
    const fields = VoiceSearchFieldsSchema.safeParse(raw);
    if (!fields.success) {
      logEvent("voice.invalid_fields", { issues: fields.error.issues.length });
      throw new ApiError(502, "No pudimos entender tu búsqueda. Inténtalo de nuevo.", {
        code: "voice_parse_error",
      });
    }
    return c.json({ text, fields: fields.data }, 200);
  });

  return app;
}

import {
  VoiceOfferFieldsSchema,
  VoiceSearchFieldsSchema,
  VoiceVehicleFieldsSchema,
} from "@andes-hack/api";
import { env } from "@andes-hack/env/server";
import { Hono } from "hono";
import type { z } from "zod";

import { logEvent } from "./lib/logger";
import { requireSession, type SessionResolver } from "./middleware";
import { ApiError } from "./utils/api-response";
import { errorHandler } from "./utils/error-handler";

export type VoiceKind = "search" | "offer" | "vehicle";
export type VoiceSearchFields = z.infer<typeof VoiceSearchFieldsSchema>;
export type VoiceOfferFields = z.infer<typeof VoiceOfferFieldsSchema>;

// Speech to text, from an audio file the person recorded.
export type Transcriber = (audio: File) => Promise<string>;
// The fields of a form that a sentence says; `today` is the Lima date, `headquarters` the place
// "la sede" or "la oficina" stands for.
export type FieldExtractor = (input: {
  kind: VoiceKind;
  text: string;
  today: string;
  weekday: string;
  headquarters: string | null;
}) => Promise<unknown>;

const OPENAI = "https://api.openai.com/v1";
const TIMEOUT_MS = 30_000;
// About thirty seconds of speech; the API accepts far more, but a form is a sentence or two.
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

const notConfigured = () =>
  new ApiError(503, "La voz no está configurada: falta OPENAI_API_KEY en el servidor.", {
    code: "voice_not_configured",
  });

// The provider's reason stays in the log; the person only learns that it failed, and, when
// the account cannot pay for it, that the feature is off for now.
async function providerFailure(step: string, response: Response | null) {
  const status = response?.status ?? 200;
  const body = (await response?.json().catch(() => null)) as {
    error?: { code?: string; type?: string };
  } | null;
  const reasons = [body?.error?.code, body?.error?.type].filter((value): value is string =>
    Boolean(value),
  );
  logEvent("voice.provider_error", { step, status, reason: reasons.join(",") || null });
  // 429 is also a plain rate limit: only an empty balance turns the feature off.
  if (status === 429 && reasons.some((value) => /quota|credit/.test(value))) {
    return new ApiError(
      503,
      "La voz no está disponible por ahora: la cuenta de OpenAI no tiene saldo.",
      { code: "voice_quota_exceeded" },
    );
  }
  if (status === 401) {
    return new ApiError(
      503,
      "La voz no está disponible por ahora: la clave de OpenAI no es válida.",
      { code: "voice_not_configured" },
    );
  }
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
    "Viaje compartido en Lima, Perú. Distritos: San Isidro, Miraflores, La Molina, Surco, San Borja, Barranco. Avenidas: Javier Prado, Arequipa, Benavides, Angamos. Pago con Yape o efectivo.",
  );
  const response = await fetch(`${OPENAI}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw await providerFailure("whisper", response);
  const body = (await response.json()) as { text?: string };
  return (body.text ?? "").trim();
};

const nullable = (type: string, extra: Record<string, unknown> = {}) => ({
  type: [type, "null"],
  ...extra,
});

// Strict JSON schemas: every property is required and "not said" is null, so the answer is
// always the form's fields.
const SEARCH_JSON_SCHEMA = {
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
    origin: nullable("string"),
    originIsCurrentLocation: { type: "boolean" },
    destination: nullable("string"),
    when: nullable("string", { enum: ["today", "tomorrow", "date", "weekdays", null] }),
    date: nullable("string"),
    days: { type: "array", items: { type: "integer", minimum: 1, maximum: 7 } },
    windowStart: nullable("string"),
    windowEnd: nullable("string"),
    womenOnly: nullable("boolean"),
    fallbackMode: nullable("string", {
      enum: ["drive_alone", "taxi_app", "public_transport", "picked_up", "other", null],
    }),
  },
} as const;

const OFFER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "origin",
    "originIsCurrentLocation",
    "destination",
    "departureTime",
    "when",
    "days",
    "date",
    "seatsTotal",
    "priceSoles",
    "paymentMethods",
    "womenOnly",
    "maxDetourMinutes",
    "note",
  ],
  properties: {
    origin: nullable("string"),
    originIsCurrentLocation: { type: "boolean" },
    destination: nullable("string"),
    departureTime: nullable("string"),
    when: nullable("string", { enum: ["recurring", "single", null] }),
    days: { type: "array", items: { type: "integer", minimum: 1, maximum: 7 } },
    date: nullable("string"),
    seatsTotal: nullable("integer"),
    priceSoles: nullable("number"),
    paymentMethods: { type: "array", items: { type: "string", enum: ["yape", "cash"] } },
    womenOnly: nullable("boolean"),
    maxDetourMinutes: nullable("integer", { enum: [0, 5, 10, null] }),
    note: nullable("string"),
  },
} as const;

const VEHICLE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["plate", "makeModel", "color", "seats"],
  properties: {
    plate: nullable("string"),
    makeModel: nullable("string"),
    color: nullable("string"),
    seats: nullable("integer"),
  },
} as const;

const JSON_SCHEMAS = {
  search: { name: "trip_search_fields", schema: SEARCH_JSON_SCHEMA },
  offer: { name: "trip_offer_fields", schema: OFFER_JSON_SCHEMA },
  vehicle: { name: "vehicle_fields", schema: VEHICLE_JSON_SCHEMA },
} as const;

const placeLines = (headquarters: string | null) => [
  '- origin: el lugar o dirección desde donde sale, tal como lo dijo (ej. "Parque Kennedy, Miraflores"). Si dice "aquí", "desde donde estoy" o "mi ubicación", deja origin en null y pon originIsCurrentLocation en true.',
  headquarters
    ? `- destination: el lugar o dirección a donde va. Si dice "la sede", "la oficina" o "el trabajo", usa "${headquarters}".`
    : "- destination: el lugar o dirección a donde va.",
];

const instructions = (input: {
  kind: VoiceKind;
  today: string;
  weekday: string;
  headquarters: string | null;
}) =>
  input.kind === "vehicle"
    ? [
        "Extraes los campos del formulario de registro de un auto en Perú a partir de lo que dijo su dueño.",
        "Usa null en lo que no dijo; nunca inventes datos.",
        '- plate: la placa con letras y números juntos como se lee, en mayúsculas y con guion si corresponde (ej. dicta "a be ce uno dos tres" → "ABC-123"). Las placas peruanas son 3 caracteres, guion y 3 caracteres.',
        '- makeModel: la marca y el modelo juntos (ej. "Toyota Corolla").',
        '- color: el color en español, con la primera letra en mayúscula (ej. "Blanco").',
        "- seats: los asientos que tiene disponibles para compartir, de 1 a 6.",
      ].join("\n")
    : input.kind === "search"
      ? [
          "Extraes los campos de un formulario de búsqueda de viaje compartido en Lima, Perú, a partir de lo que dijo la persona.",
          `Hoy es ${input.weekday} ${input.today} (hora de Lima).`,
          "Usa null en lo que la persona no dijo; nunca inventes datos.",
          ...placeLines(input.headquarters),
          '- when: "today" (hoy), "tomorrow" (mañana), "date" (una fecha concreta, con date en YYYY-MM-DD) o "weekdays" (días que se repiten, con days: 1 = lunes … 7 = domingo; "de lunes a viernes" es [1,2,3,4,5]).',
          "- windowStart y windowEnd: el rango de salida en formato HH:MM de 24 horas. Si dice una sola hora, windowStart es esa hora y windowEnd una hora después. Si dice una hora sin am/pm, supón la más probable para ir o volver del trabajo.",
          "- womenOnly: true si pide viajar solo con mujeres; null si no lo menciona.",
          '- fallbackMode: cómo iría si no encuentra viaje: "drive_alone" (en su auto), "taxi_app" (taxi o app), "public_transport" (bus, combi, metro), "picked_up" (lo recogen), "other"; null si no lo dijo.',
        ].join("\n")
      : [
          "Extraes los campos de un formulario para ofrecer un viaje compartido en auto en Lima, Perú, a partir de lo que dijo el conductor.",
          `Hoy es ${input.weekday} ${input.today} (hora de Lima).`,
          "Usa null en lo que no dijo y [] en las listas que no mencionó; nunca inventes datos.",
          ...placeLines(input.headquarters),
          "- departureTime: la hora de salida en formato HH:MM de 24 horas. Si dice una hora sin am/pm, supón la más probable para ir o volver del trabajo.",
          '- when: "recurring" si el viaje se repite ciertos días de la semana (days: 1 = lunes … 7 = domingo; "de lunes a viernes" es [1,2,3,4,5]) o "single" si es un solo día (date en YYYY-MM-DD: "hoy", "mañana" o una fecha).',
          "- seatsTotal: los asientos que ofrece, de 1 a 6.",
          '- priceSoles: el precio por asiento en soles, como número (ej. "cinco cincuenta" es 5.5); 0 si dice que es gratis.',
          '- paymentMethods: cómo le pagan: "yape" y/o "cash" (efectivo).',
          "- womenOnly: true si solo viaja con mujeres.",
          "- maxDetourMinutes: el desvío máximo que acepta: 0 (sin desvío), 5 o 10 minutos; usa el valor permitido más cercano.",
          "- note: una nota corta para los pasajeros si la dictó (máximo 280 caracteres).",
        ].join("\n");

// An OpenAI chat model with a strict JSON schema.
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
        json_schema: { ...JSON_SCHEMAS[input.kind], strict: true },
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw await providerFailure("extract", response);
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw await providerFailure("extract", null);
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

const FIELD_SCHEMAS = {
  search: VoiceSearchFieldsSchema,
  offer: VoiceOfferFieldsSchema,
  vehicle: VoiceVehicleFieldsSchema,
} as const;

// POST /voice/search, /voice/offer and /voice/vehicle: a recording of the person saying the form, as its
// fields. The key of OpenAI never leaves the server.
export function createVoiceRoutes(deps: VoiceDeps = {}) {
  const app = new Hono();
  app.onError(errorHandler);
  const getNow = deps.now ?? (() => new Date());
  const transcribe = deps.transcribe ?? whisperTranscriber;
  const extract = deps.extract ?? openAiExtractor;

  app.use("/voice/*", requireSession(deps.getSession));

  for (const kind of ["search", "offer", "vehicle"] as const) {
    app.post(`/voice/${kind}`, async (c) => {
      if (!deps.transcribe && !env.OPENAI_API_KEY) throw notConfigured();

      const form = await c.req.formData().catch(() => null);
      const audio = form?.get("audio");
      if (!(audio instanceof File) || audio.size === 0) {
        throw new ApiError(422, "Graba lo que quieres decir para enviarlo.", {
          code: "audio_required",
        });
      }
      if (audio.size > MAX_AUDIO_BYTES) {
        throw new ApiError(413, "La grabación es muy larga. Dilo en unos segundos.", {
          code: "audio_too_large",
        });
      }
      const headquarters = form?.get("headquarters");

      const text = (await transcribe(audio)).trim();
      if (!text) {
        throw new ApiError(
          422,
          "No te escuchamos. Habla más cerca del micrófono e inténtalo de nuevo.",
          { code: "no_speech" },
        );
      }

      const { date, weekday } = limaToday(getNow());
      const raw = await extract({
        kind,
        text,
        today: date,
        weekday,
        headquarters:
          typeof headquarters === "string" && headquarters.trim()
            ? headquarters.trim().slice(0, 120)
            : null,
      });
      const fields = FIELD_SCHEMAS[kind].safeParse(raw);
      if (!fields.success) {
        logEvent("voice.invalid_fields", { kind, issues: fields.error.issues.length });
        throw new ApiError(502, "No pudimos entender lo que dijiste. Inténtalo de nuevo.", {
          code: "voice_parse_error",
        });
      }
      return c.json({ text, fields: fields.data }, 200);
    });
  }

  return app;
}

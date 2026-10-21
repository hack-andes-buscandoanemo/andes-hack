import {
  CommuteWindowSchema,
  forgetCommuteRoute,
  getCommuteMemoryRoute,
  rememberCommuteRoute,
} from "@andes-hack/api";
import { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";

import { logEvent } from "./lib/logger";
import { ApiError } from "./utils/api-response";
import { errorHandler, validationHook } from "./utils/error-handler";

export type CommuteWindow = z.infer<typeof CommuteWindowSchema>;

// The departure window a person asked Te Jalo to remember, kept in Atomic Memory under their
// own account. The search never depends on it: it only fills the form's schedule.
export interface CommuteMemory {
  recall(userId: string): Promise<CommuteWindow | null>;
  // Replaces what was remembered before. Resolves only once Atomic Memory confirmed the new
  // window; `previousRemoved` is false when an older one could not be deleted afterwards.
  remember(userId: string, window: CommuteWindow): Promise<{ previousRemoved: boolean }>;
  forget(userId: string): Promise<void>;
}

// Atomic Memory did not answer, answered with an error, or took too long.
export class CommuteMemoryUnavailable extends Error {}

// Every record this feature writes carries this source, so listing and forgetting never touch
// anything else stored for the person.
const SOURCE_SITE = "te-jalo/commute-window";
const KIND = "te-jalo.commute-window";

// What this client reads from the documented responses; anything else is treated as a failure,
// never as "nothing stored".
const ListResponseSchema = z.object({
  memories: z.array(
    z.object({
      id: z.string().min(1),
      created_at: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).nullish(),
    }),
  ),
});
const IngestResponseSchema = z.object({
  stored_memory_ids: z.array(z.string()).default([]),
  updated_memory_ids: z.array(z.string()).default([]),
});

type StoredMemory = z.infer<typeof ListResponseSchema>["memories"][number];

function parsed<T>(schema: z.ZodType<T>, body: unknown, step: string): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    logEvent("commute_memory.unexpected_response", { step });
    throw new CommuteMemoryUnavailable(`unexpected ${step} response`);
  }
  return result.data;
}

// A client for the Atomic Memory HTTP API (https://docs.atomicstrata.ai/api-reference/http):
// quick ingest without extraction, list by source and delete by id. The memory subject is the
// session's user id, never a value from the request; the key stays on the server. Each
// operation, with all its calls, gives up after `timeoutMs`.
export function atomicMemoryCommutes(options: {
  apiUrl: string;
  apiKey: string;
  timeoutMs?: number;
}): CommuteMemory {
  const base = options.apiUrl.replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 3000;
  const subject = (userId: string) => `te-jalo:${userId}`;

  async function call(path: string, init: RequestInit, signal: AbortSignal, allow404 = false) {
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        signal,
        // The key must never be forwarded to another host.
        redirect: "error",
      });
    } catch (failure) {
      const reason = failure instanceof Error ? failure.name : "unknown";
      logEvent("commute_memory.transport_error", { reason });
      throw new CommuteMemoryUnavailable(reason);
    }
    if (allow404 && response.status === 404) return null;
    if (!response.ok) {
      logEvent("commute_memory.provider_error", { status: response.status });
      throw new CommuteMemoryUnavailable(String(response.status));
    }
    return (await response.json().catch(() => null)) as unknown;
  }

  async function stored(userId: string, signal: AbortSignal): Promise<StoredMemory[]> {
    const query = new URLSearchParams({
      user_id: subject(userId),
      source_site: SOURCE_SITE,
      limit: "20",
    });
    const body = await call(`/v1/memories/list?${query}`, { method: "GET" }, signal);
    return parsed(ListResponseSchema, body, "list").memories.filter(
      (memory) => memory.metadata?.kind === KIND,
    );
  }

  // Deletes and then reads back: a 2xx alone does not prove the record is gone. A 404 means it
  // already is.
  async function remove(userId: string, ids: string[], signal: AbortSignal) {
    if (ids.length === 0) return;
    const query = new URLSearchParams({ user_id: subject(userId) });
    for (const id of ids) {
      await call(
        `/v1/memories/${encodeURIComponent(id)}?${query}`,
        { method: "DELETE" },
        signal,
        true,
      );
    }
    const doomed = new Set(ids);
    const remaining = (await stored(userId, signal)).filter((memory) => doomed.has(memory.id));
    if (remaining.length > 0) {
      logEvent("commute_memory.delete_unconfirmed", { remaining: remaining.length });
      throw new CommuteMemoryUnavailable("delete not confirmed");
    }
  }

  return {
    async recall(userId) {
      const signal = AbortSignal.timeout(timeoutMs);
      const newest = (await stored(userId, signal)).toSorted((a, b) =>
        (b.created_at ?? "").localeCompare(a.created_at ?? ""),
      );
      for (const memory of newest) {
        const window = CommuteWindowSchema.safeParse(memory.metadata);
        if (window.success) {
          return { windowStart: window.data.windowStart, windowEnd: window.data.windowEnd };
        }
      }
      return null;
    },

    async remember(userId, window) {
      const signal = AbortSignal.timeout(timeoutMs);
      const previous = await stored(userId, signal);
      const body = await call(
        "/v1/memories/ingest/quick",
        {
          method: "POST",
          body: JSON.stringify({
            user_id: subject(userId),
            source_site: SOURCE_SITE,
            conversation: `En Te Jalo, esta persona pidió recordar que suele buscar viaje con salida entre las ${window.windowStart} y las ${window.windowEnd} (hora de Lima).`,
            skip_extraction: true,
            content_class: "summary",
            metadata: { kind: KIND, ...window },
          }),
        },
        signal,
      );
      const ingest = parsed(IngestResponseSchema, body, "ingest");
      const written = new Set([...ingest.stored_memory_ids, ...ingest.updated_memory_ids]);
      // The older windows are only deleted once the new one is confirmed: an id came back and
      // reading it back shows the chosen times. Otherwise the outcome is unknown and nothing is
      // deleted, so the person never loses the window they had.
      const confirmed = (await stored(userId, signal)).some((memory) => {
        const saved = CommuteWindowSchema.safeParse(memory.metadata);
        return (
          written.has(memory.id) &&
          saved.success &&
          saved.data.windowStart === window.windowStart &&
          saved.data.windowEnd === window.windowEnd
        );
      });
      if (!confirmed) {
        logEvent("commute_memory.unconfirmed_write", { ids: written.size });
        throw new CommuteMemoryUnavailable("unconfirmed write");
      }
      const stale = previous.map((memory) => memory.id).filter((id) => !written.has(id));
      try {
        await remove(userId, stale, signal);
        return { previousRemoved: true };
      } catch {
        // Recall reads the newest record, so the person still gets what they just chose.
        logEvent("commute_memory.cleanup_failed", { count: stale.length });
        return { previousRemoved: false };
      }
    },

    async forget(userId) {
      const signal = AbortSignal.timeout(timeoutMs);
      const previous = await stored(userId, signal);
      await remove(
        userId,
        previous.map((memory) => memory.id),
        signal,
      );
    },
  };
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Where the key may be sent: HTTPS, or plain HTTP only to this machine, with no credentials,
// query or fragment in the URL.
export function isSafeMemoryUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password || url.search || url.hash) return false;
  return url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK.has(url.hostname));
}

// Atomic Memory only when both settings are present and the URL is safe. Any other setup turns
// just this feature off, with a warning: the rest of the API keeps starting.
export function commuteMemoryFromEnv(settings: {
  ATOMICMEMORY_API_URL?: string;
  ATOMICMEMORY_API_KEY?: string;
}): CommuteMemory | null {
  const { ATOMICMEMORY_API_URL: apiUrl, ATOMICMEMORY_API_KEY: apiKey } = settings;
  if (!apiUrl && !apiKey) return null;
  if (!apiUrl || !apiKey || !isSafeMemoryUrl(apiUrl)) {
    logEvent("commute_memory.disabled_bad_config", {
      hasUrl: Boolean(apiUrl),
      hasKey: Boolean(apiKey),
      safeUrl: apiUrl ? isSafeMemoryUrl(apiUrl) : false,
    });
    return null;
  }
  return atomicMemoryCommutes({ apiUrl, apiKey });
}

const clockLabel = (time: string) => {
  const hours = Number(time.slice(0, 2));
  return `${hours % 12 || 12}:${time.slice(3, 5)} ${hours < 12 ? "a. m." : "p. m."}`;
};

const disabled = () =>
  new ApiError(503, "Recordar tu horario no está disponible en este servidor.", {
    code: "commute_memory_disabled",
  });

const unavailable = (what: string) =>
  new ApiError(502, `${what}: Atomic Memory no respondió. Inténtalo de nuevo.`, {
    code: "commute_memory_unavailable",
  });

// GET, PUT and DELETE /me/commute-memory, always for the signed-in person.
export function createCommuteMemoryRoutes(deps: { memory: CommuteMemory | null }) {
  const app = new OpenAPIHono({ defaultHook: validationHook });
  app.onError(errorHandler);
  const { memory } = deps;
  // The memory subject comes only from the session set by requireSession, never the request.
  const userIdOf = (user: { id: string } | undefined) => {
    const id = user?.id;
    if (!id) throw new ApiError(401, "Inicia sesión para continuar.", { code: "unauthorized" });
    return id;
  };

  app.openapi(getCommuteMemoryRoute, async (c) => {
    if (!memory) return c.json({ enabled: false, window: null }, 200);
    const window = await memory.recall(userIdOf(c.get("user"))).catch(() => {
      throw unavailable("No pudimos leer tu horario recordado");
    });
    return c.json({ enabled: true, window }, 200);
  });

  app.openapi(rememberCommuteRoute, async (c) => {
    if (!memory) throw disabled();
    const window = c.req.valid("json");
    const { previousRemoved } = await memory.remember(userIdOf(c.get("user")), window).catch(() => {
      throw unavailable("No pudimos confirmar que se guardó tu horario");
    });
    const saved = `Recordaremos tu horario: ${clockLabel(window.windowStart)} a ${clockLabel(window.windowEnd)}`;
    return c.json(
      {
        window,
        message: previousRemoved
          ? saved
          : `${saved} No pudimos borrar el horario anterior; puedes olvidarlo en Perfil.`,
      },
      200,
    );
  });

  app.openapi(forgetCommuteRoute, async (c) => {
    if (!memory) throw disabled();
    await memory.forget(userIdOf(c.get("user"))).catch(() => {
      throw unavailable("No se borró tu horario");
    });
    return c.json({ message: "Olvidamos tu horario." }, 200);
  });

  return app;
}

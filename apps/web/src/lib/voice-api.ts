import { VoiceSearchResponseSchema, type VoiceSearchResponse } from "@andes-hack/api";
import { env } from "@andes-hack/env/web";

// A failure the person can read as it is.
export class VoiceError extends Error {}

const extensionOf = (type: string) =>
  type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";

// Sends the recording to the server, which transcribes it with Whisper and returns the fields
// of the search form the person dictated. The key of OpenAI stays on the server.
export async function dictateSearch(
  audio: Blob,
  headquarters?: string,
): Promise<VoiceSearchResponse> {
  const form = new FormData();
  form.append("audio", audio, `voz.${extensionOf(audio.type)}`);
  if (headquarters) form.append("headquarters", headquarters);

  let response: Response;
  try {
    response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/voice/search`, {
      method: "POST",
      body: form,
      credentials: "include",
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new VoiceError("No pudimos enviar tu voz. Revisa tu conexión e inténtalo de nuevo.");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { error?: unknown } | null)?.error;
    throw new VoiceError(
      typeof message === "string" ? message : "No pudimos procesar tu voz. Inténtalo de nuevo.",
    );
  }
  const parsed = VoiceSearchResponseSchema.safeParse(body);
  if (!parsed.success)
    throw new VoiceError("No pudimos entender la respuesta. Inténtalo de nuevo.");
  return parsed.data;
}

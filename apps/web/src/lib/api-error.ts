import { isAxiosError } from "axios";

// The server answers in Spanish ("Ya solicitaste un asiento en este viaje."); fall back when it does not.
export function reasonOf(failure: unknown, fallback: string) {
  const reason = isAxiosError(failure) ? failure.response?.data?.error : undefined;
  return typeof reason === "string" ? reason : fallback;
}

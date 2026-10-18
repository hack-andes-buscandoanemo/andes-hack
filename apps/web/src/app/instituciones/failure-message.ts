import { isAxiosError } from "axios";

// The server's own words ("Ya estás en la lista.", "Inténtalo en unos minutos.") when it gives them.
export function failureMessage(error: unknown) {
  const serverMessage = isAxiosError(error) ? error.response?.data?.error : undefined;
  return typeof serverMessage === "string"
    ? serverMessage
    : "No pudimos enviar tus datos. Inténtalo de nuevo.";
}

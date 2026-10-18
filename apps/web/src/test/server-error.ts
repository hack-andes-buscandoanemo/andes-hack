import { AxiosError, type AxiosResponse } from "axios";

// An error the way axios raises one for a server answer like { success: false, error }.
export function serverError(status: number, error: string) {
  const response = { status, data: { success: false, status, error } } as AxiosResponse;
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, null, response);
}

import { env } from "@andes-hack/env/web";
import axios from "axios";

const serverBaseURL = env.NEXT_PUBLIC_SERVER_URL;

export function createHttpClient(baseURL = serverBaseURL) {
  return axios.create({
    baseURL,
    headers: { "Content-Type": "application/json" },
    timeout: 10_000,
  });
}

export const httpClient = createHttpClient();

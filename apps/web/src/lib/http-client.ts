import { env } from "@andes-hack/env/web";
import axios, {
  type AxiosAdapter,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";

import type { paths } from "./api-schema";

const serverBaseURL = env.NEXT_PUBLIC_SERVER_URL;

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";
type SuccessStatus = 200 | 201 | 202 | 203 | 204;

type PathsWithMethod<M extends HttpMethod> = {
  [P in keyof paths]: paths[P][M] extends Record<string, unknown> ? P : never;
}[keyof paths];

type JsonResponse<P extends keyof paths, M extends HttpMethod> = paths[P][M] extends {
  responses: infer R;
}
  ? {
      [K in keyof R & SuccessStatus]: R[K] extends {
        content: { "application/json": infer Body };
      }
        ? Body
        : never;
    }[keyof R & SuccessStatus]
  : never;

type JsonRequestBody<P extends keyof paths, M extends HttpMethod> = paths[P][M] extends {
  requestBody?: { content: { "application/json": infer Body } };
}
  ? Body
  : undefined;

export type TypedHttpClient = Omit<AxiosInstance, HttpMethod> & {
  get<P extends PathsWithMethod<"get">>(
    url: P,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<JsonResponse<P, "get">>>;
  post<P extends PathsWithMethod<"post">>(
    url: P,
    data?: JsonRequestBody<P, "post">,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<JsonResponse<P, "post">>>;
  put<P extends PathsWithMethod<"put">>(
    url: P,
    data?: JsonRequestBody<P, "put">,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<JsonResponse<P, "put">>>;
  patch<P extends PathsWithMethod<"patch">>(
    url: P,
    data?: JsonRequestBody<P, "patch">,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<JsonResponse<P, "patch">>>;
  delete<P extends PathsWithMethod<"delete">>(
    url: P,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<JsonResponse<P, "delete">>>;
};

export function createHttpClient(baseURL = serverBaseURL, adapter?: AxiosAdapter): TypedHttpClient {
  return axios.create({
    baseURL,
    headers: { "Content-Type": "application/json" },
    timeout: 10_000,
    withCredentials: true,
    ...(adapter ? { adapter } : {}),
  }) as TypedHttpClient;
}

export const httpClient = createHttpClient();

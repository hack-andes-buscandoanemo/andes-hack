import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { expect, expectTypeOf, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SERVER_URL: "http://localhost:3000",
  });
});

import type { paths } from "./api-schema";
import { createHttpClient } from "./http-client";

it("sends session cookies with credentials enabled and types responses from the generated OpenAPI schema", async () => {
  let capturedConfig: AxiosRequestConfig | undefined;
  const client = createHttpClient(
    "https://andes-hack-server-diego.diegorafaelcisnerostafur.workers.dev",
    async (config) => {
      capturedConfig = config;
      return {
        data: { status: "ok" as const },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      } as AxiosResponse;
    },
  );

  const response = await client.get("/health");

  expect(capturedConfig?.baseURL).toBe(
    "https://andes-hack-server-diego.diegorafaelcisnerostafur.workers.dev",
  );
  expect(capturedConfig?.withCredentials).toBe(true);
  expect(response.data).toEqual({ status: "ok" });
  expectTypeOf(response.data).toEqualTypeOf<
    paths["/health"]["get"]["responses"][200]["content"]["application/json"]
  >();
});

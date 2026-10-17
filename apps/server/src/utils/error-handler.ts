import type { Context } from "hono";

import type { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";

import { logEvent } from "../lib/logger";
import { ApiError, ApiResponse } from "./api-response";

function validationFailure(err: ZodError) {
  return ApiResponse.failure(422, "Los datos enviados no son válidos.", {
    code: "validation_error",
    fields: err.issues.map((issue) => issue.path.join(".")),
  });
}

export const validationHook: NonNullable<OpenAPIHono["defaultHook"]> = (result, c) => {
  if (!result.success) return c.json(validationFailure(result.error), 422);
};

/**
 * Global error handler aligned with Hono's lifecycle. Wire it up in
 * `src/index.ts`:
 *
 *   import { errorHandler } from "./utils/error-handler";
 *   app.onError(errorHandler);
 */
export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof ZodError) {
    return c.json(validationFailure(err), 422);
  }
  if (err instanceof ApiError) {
    return c.json(ApiResponse.failure(err.status, err.message, err.details), err.status as 500);
  }
  if (err instanceof HTTPException) {
    return c.json(
      ApiResponse.failure(err.status, "No se pudo completar la solicitud.", { code: "http_error" }),
      err.status as 500,
    );
  }
  logEvent("api.unhandled_error", { name: err.name });
  return c.json(
    ApiResponse.internal("Ocurrió un error inesperado.", { code: "internal_error" }),
    500,
  );
}

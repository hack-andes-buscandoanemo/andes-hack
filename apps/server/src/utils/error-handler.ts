import type { Context } from "hono";

import { HTTPException } from "hono/http-exception";

import { ApiError, ApiResponse } from "./api-response";

/**
 * Global error handler aligned with Hono's lifecycle. Wire it up in
 * `src/index.ts`:
 *
 *   import { errorHandler } from "./utils/error-handler";
 *   app.onError(errorHandler);
 */
export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof ApiError) {
    return c.json(ApiResponse.failure(err.status, err.message, err.details), err.status as 500);
  }
  if (err instanceof HTTPException) {
    return c.json(ApiResponse.failure(err.status, err.message), err.status as 500);
  }
  console.error("Unhandled error:", err);
  return c.json(ApiResponse.internal(), 500);
}

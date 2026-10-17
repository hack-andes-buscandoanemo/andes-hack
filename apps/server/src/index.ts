import { createOpenApiDocument, HealthResponseSchema } from "@andes-hack/api";
import { auth } from "@andes-hack/auth";
import { env } from "@andes-hack/env/server";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { rateLimitMiddleware } from "./middleware";
import { errorHandler, validationHook } from "./utils/error-handler";

const app = new Hono();

app.onError(errorHandler);
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);
app.use("/*", rateLimitMiddleware());

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

const openApiApp = new OpenAPIHono({ defaultHook: validationHook });

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  responses: {
    200: {
      description: "Service health",
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
    },
  },
});

openApiApp.openapi(healthRoute, (c) => {
  return c.json({ status: "ok" as const });
});

openApiApp.doc("/openapi.json", createOpenApiDocument());
openApiApp.get("/docs", apiReference({ spec: { url: "/openapi.json" } }));
app.route("/", openApiApp);

app.get("/", (c) => {
  return c.text("OK");
});

export default app;

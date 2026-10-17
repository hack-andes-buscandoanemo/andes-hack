import {
  createOpenApiDocument,
  HealthResponseSchema,
  PrivateDataResponseSchema,
  UnauthorizedResponseSchema,
} from "@andes-hack/api";
import { auth } from "@andes-hack/auth";
import { env } from "@andes-hack/env/server";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

const openApiApp = new OpenAPIHono();

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

const privateRoute = createRoute({
  method: "get",
  path: "/private",
  tags: ["Example"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Private user data",
      content: {
        "application/json": {
          schema: PrivateDataResponseSchema,
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: UnauthorizedResponseSchema,
        },
      },
    },
  },
});

openApiApp.openapi(privateRoute, async (c) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) {
    return c.json({ message: "Authentication required" }, 401);
  }

  return c.json({
    message: "This is private",
    user: session.user,
  });
});

openApiApp.doc("/openapi.json", createOpenApiDocument());
openApiApp.get("/docs", apiReference({ spec: { url: "/openapi.json" } }));
app.route("/", openApiApp);

app.get("/", (c) => {
  return c.text("OK");
});

export default app;

import { createRoute, z } from "@hono/zod-openapi";
import { expect, it } from "vitest";

import { createOpenApiDocument, HealthResponseSchema, searchTripsRoute } from "./index";

it("generates the OpenAPI 3.1 contract from registered routes with the public API server and domain tags", () => {
  const doc = createOpenApiDocument();

  expect(doc.openapi).toBe("3.1.0");
  expect(doc.servers).toEqual(
    expect.arrayContaining([
      {
        url: "https://andes-hack-server-diego.diegorafaelcisnerostafur.workers.dev",
        description: "Production server",
      },
      {
        url: "http://localhost:3000",
        description: "Local development server",
      },
    ]),
  );
  expect(doc.tags?.map((tag: { name: string }) => tag.name)).toEqual([
    "Comunidades",
    "Ofertas",
    "Búsqueda",
    "Solicitudes",
    "Emparejamiento",
    "Seguridad",
    "Público",
  ]);
  expect(doc.paths?.["/health"]?.get?.tags).toEqual(["Público"]);
  expect(doc.components?.schemas?.HealthResponse).toEqual({
    type: "object",
    required: ["status"],
    properties: {
      status: {
        type: "string",
        enum: ["ok"],
      },
    },
  });
});

it("includes newly declared createRoute routes when generating the OpenAPI document", () => {
  const customRoute = createRoute({
    method: "get",
    path: "/comunidades",
    tags: ["Comunidades"],
    responses: {
      200: {
        description: "Lista de comunidades",
        content: {
          "application/json": {
            schema: z
              .object({
                id: z.string(),
              })
              .openapi("CommunitySummary"),
          },
        },
      },
    },
  });

  const doc = createOpenApiDocument([customRoute]);

  expect(doc.paths?.["/comunidades"]?.get?.tags).toEqual(["Comunidades"]);
  expect(doc.components?.schemas?.CommunitySummary).toEqual({
    type: "object",
    required: ["id"],
    properties: {
      id: {
        type: "string",
      },
    },
  });
  expect(HealthResponseSchema.parse({ status: "ok" })).toEqual({ status: "ok" });
});

it("fails with the exact drift message when a route changes without regenerating openapi.json", async () => {
  const { verifyOpenApiDocument } = await import("./verify-openapi");
  const extraRoute = createRoute({
    method: "get",
    path: "/ofertas",
    tags: ["Ofertas"],
    responses: {
      200: {
        description: "Ofertas disponibles",
        content: {
          "application/json": {
            schema: z.object({ id: z.string() }).openapi("OfferItem"),
          },
        },
      },
    },
  });

  const result = verifyOpenApiDocument({
    committedDocument: createOpenApiDocument(),
    regeneratedDocument: createOpenApiDocument([extraRoute]),
  });

  expect(result).toEqual({
    ok: false,
    message: "OpenAPI document drift detected. Regenerate the committed spec.",
  });
});

it("passes verification when the committed openapi.json matches the generated routes", async () => {
  const { verifyOpenApiDocument } = await import("./verify-openapi");

  const result = verifyOpenApiDocument();

  expect(result).toEqual({
    ok: true,
    message: "OpenAPI document is up to date.",
  });
});

it("documents the error responses of the search route with the shared error body", () => {
  const doc = createOpenApiDocument([searchTripsRoute]);
  const responses = doc.paths?.["/communities/{id}/search"]?.post?.responses ?? {};

  expect(Object.keys(responses).sort()).toEqual(["200", "400", "401", "403", "409", "422"]);
  expect(doc.components?.schemas?.ApiError).toMatchObject({
    required: ["success", "status", "error"],
  });
});

it("documents every error the offer detail, seat request and withdrawal routes return", () => {
  const doc = createOpenApiDocument();
  const codes = (path: string, method: "get" | "post") =>
    Object.keys(doc.paths?.[path]?.[method]?.responses ?? {}).sort();

  expect(codes("/offers/{id}", "get")).toEqual(["200", "401", "404", "422"]);
  expect(codes("/offers/{id}/bookings", "post")).toEqual([
    "201",
    "401",
    "403",
    "404",
    "409",
    "422",
  ]);
  expect(codes("/bookings/{id}/cancel", "post")).toEqual(["200", "401", "404", "409", "422"]);
  expect(codes("/offers/{id}/cancel", "post")).toEqual(["200", "401", "403", "404", "422"]);
});

it("publishes the travel preferences route with every error it returns", () => {
  const doc = createOpenApiDocument();
  const responses = doc.paths?.["/communities/{id}/preferences"]?.put?.responses ?? {};

  expect(Object.keys(responses).sort()).toEqual(["200", "401", "403", "422"]);
});

it("publishes the day-of-trip routes with every error they return", () => {
  const doc = createOpenApiDocument();
  const codes = (path: string) => Object.keys(doc.paths?.[path]?.post?.responses ?? {}).sort();

  expect(codes("/offers/{id}/start")).toEqual(["200", "401", "404", "409", "422"]);
  expect(codes("/bookings/{id}/board")).toEqual(["200", "401", "404", "409", "422"]);
  expect(codes("/bookings/{id}/arrive")).toEqual(["200", "401", "404", "409", "422"]);
  expect(codes("/bookings/{id}/no-show")).toEqual(["200", "401", "404", "409", "422"]);
});

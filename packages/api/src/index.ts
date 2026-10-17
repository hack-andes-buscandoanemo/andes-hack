import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const HealthResponseSchema = z
  .object({
    status: z.literal("ok"),
  })
  .openapi("HealthResponse");

export function createOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "andes-hack API",
      version: "0.1.0",
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Local development server",
      },
    ],
    paths: {
      "/health": {
        get: {
          tags: ["System"],
          responses: {
            "200": {
              description: "Service health",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthResponse" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        HealthResponse: {
          type: "object",
          required: ["status"],
          properties: {
            status: {
              type: "string",
              enum: ["ok"],
            },
          },
        },
      },
    },
  };
}

export const openApiDocument = createOpenApiDocument();

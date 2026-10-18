import { createRoute, OpenAPIHono, type RouteConfig, z } from "@hono/zod-openapi";

export const OPENAPI_TAGS = [
  { name: "Comunidades", description: "Acceso y gestión de comunidades e instituciones aliadas" },
  { name: "Ofertas", description: "Publicación y gestión de recorridos ofrecidos por conductores" },
  { name: "Búsqueda", description: "Búsqueda de viajes compatibles para pasajeros" },
  { name: "Solicitudes", description: "Solicitudes de asiento y confirmación de pasajeros" },
  { name: "Emparejamiento", description: "Compatibilidad de rutas, horarios y gasto compartido" },
  { name: "Público", description: "Rutas públicas y estado del servicio" },
] as const;

export const OPENAPI_DOCUMENT_CONFIG = {
  openapi: "3.1.0" as const,
  info: {
    title: "andes-hack API",
    version: "0.1.0",
  },
  servers: [
    {
      url: "https://andes-hack-server-diego.diegorafaelcisnerostafur.workers.dev",
      description: "Production server",
    },
    {
      url: "http://localhost:3000",
      description: "Local development server",
    },
  ],
  tags: [...OPENAPI_TAGS],
};

export const HealthResponseSchema = z
  .object({
    status: z.literal("ok"),
  })
  .openapi("HealthResponse");

export const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["Público"],
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

export const CommunityKindSchema = z.enum(["company", "university", "public_entity", "event"]);

export const CommunitySummarySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    kind: CommunityKindSchema,
    isDemo: z.boolean(),
  })
  .openapi("CommunitySummary");

export const CommunitiesResponseSchema = z
  .object({
    communities: z.array(CommunitySummarySchema),
  })
  .openapi("CommunitiesResponse");

export const listCommunitiesRoute = createRoute({
  method: "get",
  path: "/communities",
  tags: ["Comunidades"],
  responses: {
    200: {
      description: "Lista pública de comunidades",
      content: {
        "application/json": {
          schema: CommunitiesResponseSchema,
        },
      },
    },
  },
});

export const JoinCommunityParamsSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const JoinCommunityBodySchema = z
  .object({
    code: z.string().trim().min(1, "Ingresa tu código de acceso."),
  })
  .openapi("JoinCommunityRequest");

export const JoinCommunityResponseSchema = z
  .object({
    joined: z.literal(true),
    alreadyMember: z.boolean(),
    communityId: z.string().uuid(),
    communityName: z.string(),
    verificationMethod: z.enum(["join_code", "email_domain"]),
    isTeam: z.boolean(),
    message: z.string(),
  })
  .openapi("JoinCommunityResponse");

export const joinCommunityRoute = createRoute({
  method: "post",
  path: "/communities/{id}/join",
  tags: ["Comunidades"],
  request: {
    params: JoinCommunityParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: JoinCommunityBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Membresía verificada en la comunidad",
      content: {
        "application/json": {
          schema: JoinCommunityResponseSchema,
        },
      },
    },
  },
});

export const registeredOpenApiRoutes: readonly RouteConfig[] = [
  healthRoute,
  listCommunitiesRoute,
  joinCommunityRoute,
];

export function createOpenApiDocument(routes: readonly RouteConfig[] = registeredOpenApiRoutes) {
  const app = new OpenAPIHono();
  for (const route of routes) {
    app.openAPIRegistry.registerPath(route);
  }
  return app.getOpenAPI31Document(OPENAPI_DOCUMENT_CONFIG);
}

export function serializeOpenApiDocument(document: unknown = createOpenApiDocument()) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export const openApiDocument = createOpenApiDocument();

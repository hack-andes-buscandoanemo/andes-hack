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
    hasEmailVerification: z.boolean(),
    matchedEmailDomain: z.string().nullable(),
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

export const verifyEmailCommunityRoute = createRoute({
  method: "post",
  path: "/communities/{id}/verify-email",
  tags: ["Comunidades"],
  request: {
    params: JoinCommunityParamsSchema,
  },
  responses: {
    200: {
      description: "Membresía verificada con correo institucional",
      content: {
        "application/json": {
          schema: JoinCommunityResponseSchema,
        },
      },
    },
  },
});

export const UsualModeSchema = z.enum(
  ["drove_alone", "drove_with_others", "car_passenger", "public_transport", "taxi_app", "other"],
  { message: "Elige cómo viajaste la última vez." },
);

export const TravelRoleSchema = z.enum(["driver", "passenger", "both"]);

export const MembershipSummarySchema = z
  .object({
    id: z.string().uuid(),
    communityId: z.string().uuid(),
    communityName: z.string(),
    destinationName: z.string(),
    role: z.enum(["member", "admin"]),
    verificationMethod: z.enum(["join_code", "email_domain"]),
    consentVersion: z.string().nullable(),
    consentAt: z.string().nullable(),
    usualMode: UsualModeSchema.nullable(),
    travelRole: TravelRoleSchema.nullable(),
    alias: z.string().nullable(),
    identifiesAsWoman: z.boolean(),
    womenOnly: z.boolean(),
    isTeam: z.boolean(),
  })
  .openapi("MembershipSummary");

export const MeResponseSchema = z
  .object({
    user: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().email(),
    }),
    memberships: z.array(MembershipSummarySchema),
  })
  .openapi("MeResponse");

export const getMeRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["Comunidades"],
  responses: {
    200: {
      description: "Perfil y membresías de la persona autenticada",
      content: {
        "application/json": {
          schema: MeResponseSchema,
        },
      },
    },
  },
});

export const UpdateMembershipBodySchema = z
  .object({
    consentAccepted: z.boolean().refine((value) => value === true, {
      message: "Debes aceptar las condiciones para continuar.",
    }),
    usualMode: UsualModeSchema,
    travelRole: TravelRoleSchema,
    alias: z
      .string()
      .trim()
      .min(2, "El nombre visible debe tener entre 2 y 30 caracteres.")
      .max(30, "El nombre visible debe tener entre 2 y 30 caracteres.")
      .optional(),
  })
  .openapi("UpdateMembershipRequest");

export const updateMembershipRoute = createRoute({
  method: "patch",
  path: "/communities/{id}/membership",
  tags: ["Comunidades"],
  request: {
    params: JoinCommunityParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: UpdateMembershipBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Consentimiento, modo habitual y rol de viaje actualizados",
      content: {
        "application/json": {
          schema: MembershipSummarySchema,
        },
      },
    },
  },
});

export const registeredOpenApiRoutes: readonly RouteConfig[] = [
  healthRoute,
  listCommunitiesRoute,
  joinCommunityRoute,
  verifyEmailCommunityRoute,
  getMeRoute,
  updateMembershipRoute,
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

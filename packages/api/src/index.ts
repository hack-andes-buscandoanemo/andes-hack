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

export function normalizePlate(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}

export const PERUVIAN_PLATE_REGEX = /^[A-Z0-9]{3}\d{3}$/;

export const VehicleSummarySchema = z
  .object({
    id: z.string().uuid(),
    plate: z.string(),
    make: z.string(),
    model: z.string(),
    color: z.string(),
    seats: z.number().int().min(1).max(6),
  })
  .openapi("VehicleSummary");

export const VehiclesResponseSchema = z
  .object({
    vehicles: z.array(VehicleSummarySchema),
  })
  .openapi("VehiclesResponse");

export const CreateVehicleBodySchema = z
  .object({
    plate: z
      .string()
      .transform(normalizePlate)
      .refine((value) => PERUVIAN_PLATE_REGEX.test(value), {
        message: "Ingresa una placa válida (ej. ABC-123).",
      }),
    makeModel: z.string().trim().min(1, "Ingresa la marca y modelo de tu vehículo.").optional(),
    make: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    color: z.string().trim().min(1, "Ingresa el color de tu vehículo."),
    seats: z.number().int().min(1).max(6),
  })
  .refine((data) => Boolean(data.makeModel || data.make), {
    message: "Ingresa la marca y modelo de tu vehículo.",
    path: ["makeModel"],
  })
  .openapi("CreateVehicleRequest");

export const listVehiclesRoute = createRoute({
  method: "get",
  path: "/vehicles",
  tags: ["Ofertas"],
  responses: {
    200: {
      description: "Vehículos registrados por la persona autenticada",
      content: {
        "application/json": {
          schema: VehiclesResponseSchema,
        },
      },
    },
  },
});

export const createVehicleRoute = createRoute({
  method: "post",
  path: "/vehicles",
  tags: ["Ofertas"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateVehicleBodySchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Vehículo registrado",
      content: {
        "application/json": {
          schema: VehicleSummarySchema,
        },
      },
    },
  },
});

export const ZoneSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    district: z.string(),
    lat: z.number(),
    lng: z.number(),
  })
  .openapi("ZoneSummary");

export const ZonesResponseSchema = z
  .object({
    zones: z.array(ZoneSummarySchema),
  })
  .openapi("ZonesResponse");

export const listCommunityZonesRoute = createRoute({
  method: "get",
  path: "/communities/{id}/zones",
  tags: ["Ofertas"],
  request: {
    params: JoinCommunityParamsSchema,
  },
  responses: {
    200: {
      description: "Zonas disponibles para la comunidad",
      content: {
        "application/json": {
          schema: ZonesResponseSchema,
        },
      },
    },
  },
});

export const TripDirectionSchema = z.enum(["outbound", "return"]);
export const OfferStatusSchema = z.enum(["active", "paused", "cancelled"]);

export const CreateTripOfferBodySchema = z
  .object({
    vehicleId: z.string().uuid("Selecciona un vehículo."),
    direction: TripDirectionSchema,
    originZoneId: z.string().min(1, "Selecciona una zona."),
    departureTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Ingresa una hora de salida válida."),
    daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1).nullable().optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Ingresa una fecha válida.")
      .nullable()
      .optional(),
    seatsTotal: z.number().int().min(1).max(6),
    maxDetourMinutes: z.union([z.literal(0), z.literal(5), z.literal(10)]),
    womenOnly: z.boolean().default(false),
    note: z.string().max(280, "La nota no puede superar 280 caracteres.").nullable().optional(),
  })
  .refine(
    (data) => {
      const hasDate = Boolean(data.date);
      const hasDays = Boolean(data.daysOfWeek && data.daysOfWeek.length > 0);
      return hasDate !== hasDays;
    },
    {
      message: "Elige una fecha puntual o días habituales, pero no ambos.",
      path: ["date"],
    },
  )
  .openapi("CreateTripOfferRequest");

export const TripOfferSummarySchema = z
  .object({
    id: z.string().uuid(),
    communityId: z.string().uuid(),
    driverId: z.string().nullable(),
    vehicleId: z.string().uuid().nullable(),
    direction: TripDirectionSchema,
    originZoneId: z.string(),
    originZoneName: z.string().optional(),
    departureTime: z.string(),
    daysOfWeek: z.array(z.number().int()).nullable(),
    date: z.string().nullable(),
    seatsTotal: z.number().int(),
    seatsTaken: z.number().int(),
    maxDetourMinutes: z.number().int(),
    womenOnly: z.boolean(),
    note: z.string().nullable(),
    status: OfferStatusSchema,
  })
  .openapi("TripOfferSummary");

export const CreateTripOfferResponseSchema = z
  .object({
    offer: TripOfferSummarySchema,
    message: z.string(),
  })
  .openapi("CreateTripOfferResponse");

export const TripOffersResponseSchema = z
  .object({
    offers: z.array(TripOfferSummarySchema),
  })
  .openapi("TripOffersResponse");

export const listCommunityOffersRoute = createRoute({
  method: "get",
  path: "/communities/{id}/offers",
  tags: ["Ofertas"],
  request: {
    params: JoinCommunityParamsSchema,
  },
  responses: {
    200: {
      description: "Viajes ofrecidos por la persona autenticada en la comunidad",
      content: {
        "application/json": {
          schema: TripOffersResponseSchema,
        },
      },
    },
  },
});

export const createCommunityOfferRoute = createRoute({
  method: "post",
  path: "/communities/{id}/offers",
  tags: ["Ofertas"],
  request: {
    params: JoinCommunityParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: CreateTripOfferBodySchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Viaje ofrecido creado",
      content: {
        "application/json": {
          schema: CreateTripOfferResponseSchema,
        },
      },
    },
  },
});

export const UpdateOfferStatusBodySchema = z
  .object({
    status: z.enum(["active", "paused"]),
  })
  .openapi("UpdateOfferStatusRequest");

export const updateOfferStatusRoute = createRoute({
  method: "patch",
  path: "/offers/{id}/status",
  tags: ["Ofertas"],
  request: {
    params: JoinCommunityParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: UpdateOfferStatusBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Estado de la oferta actualizado",
      content: {
        "application/json": {
          schema: TripOfferSummarySchema,
        },
      },
    },
  },
});

export const FallbackModeSchema = z.enum([
  "drive_alone",
  "taxi_app",
  "public_transport",
  "picked_up",
  "other",
]);

export const InfeasibleReasonSchema = z.enum([
  "different_community",
  "days_mismatch",
  "women_only",
  "previously_rejected",
  "no_seats",
  "no_walkable_meeting_point",
  "outside_time_window",
  "detour_exceeded",
]);

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Ingresa una hora válida.");

// Calendar date in Lima (UTC−5, no daylight saving time); en-CA formats as YYYY-MM-DD.
const todayInLima = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

export const SearchTripsBodySchema = z
  .object({
    direction: TripDirectionSchema,
    originZoneId: z.string().min(1, "Selecciona tu zona."),
    windowStart: clockTime,
    windowEnd: clockTime,
    daysOfWeek: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length, "No repitas los días.")
      .nullable()
      .optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Ingresa una fecha válida.")
      .refine((date) => date >= todayInLima(), "La fecha no puede ser anterior a hoy.")
      .nullable()
      .optional(),
    maxWalkMinutes: z.number().int().min(1).max(30).default(15),
    fallbackMode: FallbackModeSchema,
    womenOnly: z.boolean().default(false),
  })
  .refine((data) => Boolean(data.date) !== Boolean(data.daysOfWeek && data.daysOfWeek.length > 0), {
    message: "Elige una fecha puntual o días habituales, pero no ambos.",
    path: ["date"],
  })
  .refine((data) => data.windowStart < data.windowEnd, {
    message: "La hora de inicio debe ser anterior a la hora de fin.",
    path: ["windowEnd"],
  })
  .openapi("SearchTripsRequest");

// Never carries plates, emails or exact locations: only what the result card shows.
export const TripMatchSchema = z
  .object({
    offerId: z.string().uuid(),
    driverName: z.string(),
    driverPhotoUrl: z.string().url().nullable(),
    originZoneName: z.string(),
    destinationName: z.string(),
    direction: TripDirectionSchema,
    departureTime: z.string(),
    seatsFree: z.number().int(),
    meetingPointName: z.string(),
    pickupAt: z.string(),
    arrivalAt: z.string(),
    detourMinutes: z.number().int(),
    walkMinutes: z.number().int(),
  })
  .openapi("TripMatch");

export const SearchTripsResponseSchema = z
  .object({
    // The passenger's saved need, one per direction; kept even when nothing matched.
    requestId: z.string().uuid(),
    // Best match first, in the engine's order.
    matches: z.array(TripMatchSchema),
    // Why nothing matched, from the engine; null when something did.
    reason: InfeasibleReasonSchema.nullable(),
  })
  .openapi("SearchTripsResponse");

// Body of every error the server answers: a readable Spanish message plus a stable `details.code`.
export const ApiErrorSchema = z
  .object({
    success: z.literal(false),
    status: z.number().int(),
    error: z.string(),
    details: z
      .object({ code: z.string(), fields: z.array(z.string()).optional() })
      .passthrough()
      .optional(),
  })
  .openapi("ApiError");

const apiErrorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: ApiErrorSchema } },
});

export const searchTripsRoute = createRoute({
  method: "post",
  path: "/communities/{id}/search",
  tags: ["Búsqueda"],
  request: {
    params: JoinCommunityParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: SearchTripsBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Viajes compatibles con la necesidad guardada de la persona",
      content: {
        "application/json": {
          schema: SearchTripsResponseSchema,
        },
      },
    },
    400: apiErrorResponse("La zona elegida no existe (`zone_not_found`)"),
    401: apiErrorResponse("No hay sesión iniciada (`unauthorized`)"),
    403: apiErrorResponse(
      "No es miembro de la comunidad o no activó Solo mujeres (`women_only_not_allowed`)",
    ),
    409: apiErrorResponse(
      "La sede de la comunidad no se puede usar para buscar (`unknown_destination`)",
    ),
    422: apiErrorResponse("Los datos enviados no son válidos (`validation_error`)"),
  },
});

const waitlistContact = {
  institution: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  // Nothing is stored without explicit consent (Ley 29733 de protección de datos personales).
  consent: z.literal(true),
  // Left empty by people; bots that fill every field are thanked and ignored.
  website: z.string().optional(),
};

export const WaitlistEntryRequestSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("institution"),
      ...waitlistContact,
      role: z.string().trim().min(1).max(80),
      onSiteCount: z.number().int().min(1).max(100_000),
      wantsPilot: z.boolean(),
    }),
    z.object({
      kind: z.literal("individual"),
      ...waitlistContact,
    }),
  ])
  .openapi("WaitlistEntryRequest");

export const WaitlistEntryResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi("WaitlistEntryResponse");

export const joinWaitlistRoute = createRoute({
  method: "post",
  path: "/public/waitlist",
  tags: ["Público"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: WaitlistEntryRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Inscripción recibida en la lista de espera",
      content: {
        "application/json": {
          schema: WaitlistEntryResponseSchema,
        },
      },
    },
    409: apiErrorResponse("Ya está en la lista: «Ya estás en la lista.»"),
    422: apiErrorResponse("Datos incompletos o sin consentimiento"),
    429: apiErrorResponse("Demasiados envíos desde la misma IP: «Inténtalo en unos minutos.»"),
  },
});

export const WaitlistSummarySchema = z
  .object({
    institutions: z.number().int(),
    individuals: z.number().int(),
  })
  .openapi("WaitlistSummary");

export const waitlistSummaryRoute = createRoute({
  method: "get",
  path: "/public/waitlist/summary",
  tags: ["Público"],
  responses: {
    200: {
      description: "Totales de la lista de espera, sin datos de contacto",
      content: {
        "application/json": {
          schema: WaitlistSummarySchema,
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
  listVehiclesRoute,
  createVehicleRoute,
  listCommunityZonesRoute,
  listCommunityOffersRoute,
  createCommunityOfferRoute,
  updateOfferStatusRoute,
  searchTripsRoute,
  joinWaitlistRoute,
  waitlistSummaryRoute,
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

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
    slug: z.string(),
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
    404: apiErrorResponse("La cuenta ya no existe"),
  },
});

export const DeleteMeResponseSchema = z
  .object({ message: z.string(), deletedAt: z.string().datetime() })
  .openapi("DeleteMeResponse");

export const deleteMeRoute = createRoute({
  method: "delete",
  path: "/me",
  tags: ["Comunidades"],
  responses: {
    200: {
      description: "Cuenta eliminada y datos personales borrados",
      content: { "application/json": { schema: DeleteMeResponseSchema } },
    },
    404: apiErrorResponse("La cuenta ya no existe"),
  },
});

const ProfilePhotoContentTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);

export const profilePhotoUploadRoute = createRoute({
  method: "post",
  path: "/me/profile-photo/upload",
  tags: ["Comunidades"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z
            .object({
              contentType: ProfilePhotoContentTypeSchema,
              size: z
                .number()
                .int()
                .min(1)
                .max(2 * 1024 * 1024),
            })
            .openapi("ProfilePhotoUploadRequest"),
        },
      },
    },
  },
  responses: {
    200: {
      description: "URL de corta duración para subir la foto directamente a R2",
      content: {
        "application/json": {
          schema: z
            .object({ uploadUrl: z.string().url(), key: z.string(), expiresIn: z.number().int() })
            .openapi("ProfilePhotoUploadResponse"),
        },
      },
    },
  },
});

export const confirmProfilePhotoRoute = createRoute({
  method: "post",
  path: "/me/profile-photo/confirm",
  tags: ["Comunidades"],
  request: {
    body: { content: { "application/json": { schema: z.object({ key: z.string().min(1) }) } } },
  },
  responses: {
    200: {
      description: "Foto comprobada y guardada en el perfil",
      content: { "application/json": { schema: z.object({ photoUrl: z.string().url() }) } },
    },
    400: apiErrorResponse("La imagen no cumple el formato o tamaño permitidos"),
  },
});

export const getMyProfilePhotoRoute = createRoute({
  method: "get",
  path: "/me/profile-photo",
  tags: ["Comunidades"],
  responses: {
    200: {
      description: "URL temporal de la propia foto de perfil",
      content: {
        "application/json": {
          schema: z
            .object({ photoUrl: z.string().url().nullable() })
            .openapi("MyProfilePhotoResponse"),
        },
      },
    },
  },
});

export const deleteMyProfilePhotoRoute = createRoute({
  method: "delete",
  path: "/me/profile-photo",
  tags: ["Comunidades"],
  responses: {
    200: {
      description: "Foto de perfil eliminada",
      content: { "application/json": { schema: z.object({ message: z.string() }) } },
    },
  },
});

// Onboarding sends the consent and the travel role; "Editar perfil" (US-035) sends neither and
// keeps the consent already given.
export const UpdateMembershipBodySchema = z
  .object({
    consentAccepted: z
      .boolean()
      .refine((value) => value === true, {
        message: "Debes aceptar las condiciones para continuar.",
      })
      .optional(),
    usualMode: UsualModeSchema,
    travelRole: TravelRoleSchema.optional(),
    alias: z
      .string()
      .trim()
      .min(2, "El nombre visible debe tener entre 2 y 30 caracteres.")
      .max(30, "El nombre visible debe tener entre 2 y 30 caracteres.")
      .optional(),
  })
  .refine((body) => !body.consentAccepted || body.travelRole, {
    message: "Elige si viajarás como conductor, pasajero o ambos.",
    path: ["travelRole"],
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
    401: apiErrorResponse("No hay sesión iniciada (`unauthorized`)"),
    403: apiErrorResponse("No es miembro de la comunidad (`community_membership_required`)"),
    404: apiErrorResponse("La comunidad no existe (`community_not_found`)"),
    422: apiErrorResponse(
      "Datos no válidos (`validation_error`), o una edición del perfil sin consentimiento previo (`consent_required`)",
    ),
  },
});

// "Me identifico como mujer" is only used for matching: no other person ever sees it.
export const TravelPreferencesSchema = z
  .object({
    identifiesAsWoman: z.boolean(),
    womenOnly: z.boolean(),
  })
  .openapi("TravelPreferences");

export const TravelPreferencesResponseSchema = TravelPreferencesSchema.extend({
  message: z.string(),
}).openapi("TravelPreferencesResponse");

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
    // Left out, the person's "Solo mujeres" preference from their profile applies.
    womenOnly: z.boolean().optional(),
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

// The fuel of the leg and each occupant's share, to talk about a voluntary contribution
// (US-034). Te Jalo never charges. Null when the leg's distance is unknown.
export const FuelEstimateSchema = z
  .object({
    tripSoles: z.number(),
    // Rounded down to the céntimo: the shares added up never exceed the trip.
    perOccupantSoles: z.number(),
    // The driver, the accepted passengers, and the person looking when not yet aboard.
    occupants: z.number().int().min(1),
  })
  .nullable()
  .openapi("FuelEstimate");

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
    fuelEstimate: FuelEstimateSchema,
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

export const updateTravelPreferencesRoute = createRoute({
  method: "put",
  path: "/communities/{id}/preferences",
  tags: ["Comunidades"],
  request: {
    params: JoinCommunityParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: TravelPreferencesSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Preferencias de viaje guardadas",
      content: {
        "application/json": {
          schema: TravelPreferencesResponseSchema,
        },
      },
    },
    401: apiErrorResponse("No hay sesión iniciada (`unauthorized`)"),
    403: apiErrorResponse("No es miembro de la comunidad (`community_membership_required`)"),
    422: apiErrorResponse(
      "Solo mujeres sin confirmar que se identifica como mujer (`women_only_requires_declaration`), o datos no válidos (`validation_error`)",
    ),
  },
});

const BookingStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "cancelled_by_passenger",
  "cancelled_by_driver",
  "completed",
  "no_show",
]);

export const OfferDetailSchema = z
  .object({
    offerId: z.string().uuid(),
    // Only an active trip can be requested; paused and cancelled trips are unavailable.
    status: z.enum(["active", "paused", "cancelled"]),
    driverName: z.string(),
    driverPhotoUrl: z.string().url().nullable(),
    communityName: z.string(),
    originZoneName: z.string(),
    destinationName: z.string(),
    direction: TripDirectionSchema,
    departureTime: z.string(),
    date: z.string().nullable(),
    daysOfWeek: z.array(z.number().int()).nullable(),
    seatsFree: z.number().int(),
    // The plate stays null until the driver accepts the person (or for the driver themself).
    vehicle: z
      .object({ make: z.string(), model: z.string(), plate: z.string().nullable() })
      .nullable(),
    note: z.string().nullable(),
    isOwn: z.boolean(),
    hasOpenNeed: z.boolean(),
    // What the server calculates for the person's saved need; null without a need or when it no longer fits.
    match: z
      .object({
        meetingPointName: z.string(),
        pickupAt: z.string(),
        arrivalAt: z.string(),
        detourMinutes: z.number().int(),
        walkMinutes: z.number().int(),
      })
      .nullable(),
    // The person's active or rejected request on this trip, if any.
    booking: z.object({ id: z.string().uuid(), status: BookingStatusSchema }).nullable(),
    fuelEstimate: FuelEstimateSchema,
  })
  .openapi("OfferDetail");

export const getOfferDetailRoute = createRoute({
  method: "get",
  path: "/offers/{id}",
  tags: ["Ofertas"],
  request: { params: JoinCommunityParamsSchema },
  responses: {
    200: {
      description: "Detalle del viaje para miembros de su comunidad, sin placa hasta la aceptación",
      content: { "application/json": { schema: OfferDetailSchema } },
    },
    401: apiErrorResponse("No hay sesión iniciada (`unauthorized`)"),
    404: apiErrorResponse("El viaje no existe o no pertenece a tu comunidad (`offer_not_found`)"),
    422: apiErrorResponse("El identificador no es válido (`validation_error`)"),
  },
});

export const MyTripsQuerySchema = z.object({
  role: z.enum(["passenger", "driver"]).default("passenger"),
  scope: z.enum(["upcoming", "past"]).default("upcoming"),
});

// Derived on the server from the booking and the offer, so every client shows the same state.
export const TripStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "cancelled",
  "completed",
  "no_show",
  "paused",
  "active",
]);

export const MyTripSchema = z
  .object({
    // The booking for a passenger, the offer for a driver.
    id: z.string().uuid(),
    offerId: z.string().uuid(),
    role: z.enum(["passenger", "driver"]),
    status: TripStatusSchema,
    direction: TripDirectionSchema,
    date: z.string().nullable(),
    daysOfWeek: z.array(z.number().int()).nullable(),
    // Pickup time for a passenger, departure time for a driver.
    time: z.string(),
    originZoneName: z.string(),
    destinationName: z.string(),
    meetingPointName: z.string().nullable(),
    // Alias always; the plate only once the request is accepted. Null for the driver's own view.
    driver: z.object({ alias: z.string(), plate: z.string().nullable() }).nullable(),
    // Driver view only: seats offered and seats still free (accepted passengers hold seats).
    seatsTotal: z.number().int().nullable(),
    seatsFree: z.number().int().nullable(),
    // Driver view only: requests waiting for an answer, and the aliases of accepted passengers.
    pendingRequests: z.number().int().nullable(),
    acceptedPassengers: z.array(z.string()).nullable(),
    // Passenger's own need, which can differ from the driver's zone and calendar.
    passengerRequest: z
      .object({
        communityId: z.string().uuid(),
        originZoneId: z.string(),
        date: z.string().nullable(),
        daysOfWeek: z.array(z.number().int()).nullable(),
        fallbackMode: FallbackModeSchema,
        returnWindow: z.object({ start: z.string(), end: z.string() }).nullable(),
      })
      .optional(),
    fuelEstimate: FuelEstimateSchema,
  })
  .openapi("MyTrip");

export const MyTripsResponseSchema = z
  .object({ trips: z.array(MyTripSchema) })
  .openapi("MyTripsResponse");

export const listMyTripsRoute = createRoute({
  method: "get",
  path: "/me/trips",
  tags: ["Viajes"],
  request: { query: MyTripsQuerySchema },
  responses: {
    200: {
      description:
        "Viajes de la persona como pasajera o conductora; la placa y el alias del otro solo en viajes aceptados",
      content: { "application/json": { schema: MyTripsResponseSchema } },
    },
    401: apiErrorResponse("No hay sesión iniciada (`unauthorized`)"),
    422: apiErrorResponse("El rol o el periodo no son válidos (`validation_error`)"),
  },
});

// The person's own impact (US-035), read from the US-030 metrics.
export const MyImpactSchema = z
  .object({
    // Accepted seats as a passenger, plus own offers that carried at least one passenger.
    sharedTrips: z.number().int(),
    // Only as a passenger who would otherwise have driven or taken a taxi: a driver still drove.
    carTripsAvoided: z.number().int(),
    // An estimate (see /datos); never below zero on the profile.
    co2Kg: z.number(),
    // Passenger trips that would otherwise have been by public transport: no car avoided.
    fromPublicTransport: z.number().int(),
  })
  .openapi("MyImpact");

export const getMyImpactRoute = createRoute({
  method: "get",
  path: "/communities/{id}/me/impact",
  tags: ["Viajes"],
  request: { params: JoinCommunityParamsSchema },
  responses: {
    200: {
      description:
        "Viajes compartidos, viajes en auto evitados y CO₂ evitado (estimado) de la persona",
      content: { "application/json": { schema: MyImpactSchema } },
    },
    401: apiErrorResponse("No hay sesión iniciada (`unauthorized`)"),
    403: apiErrorResponse(
      "No es miembro o no completó su registro (`community_membership_required`, `onboarding_required`)",
    ),
    422: apiErrorResponse("El identificador no es válido (`validation_error`)"),
  },
});

export const RequestSeatBodySchema = z
  .object({
    // Plain text for the driver; there is no chat before the request is accepted.
    message: z.string().trim().max(280).optional(),
  })
  .openapi("RequestSeatRequest");

export const RequestSeatResponseSchema = z
  .object({
    booking: z.object({
      id: z.string().uuid(),
      status: BookingStatusSchema,
      message: z.string().nullable(),
      meetingPointName: z.string(),
      pickupAt: z.string(),
      arrivalAt: z.string(),
      detourMinutes: z.number().int(),
      walkMinutes: z.number().int(),
    }),
  })
  .openapi("RequestSeatResponse");

export const requestSeatRoute = createRoute({
  method: "post",
  path: "/offers/{id}/bookings",
  tags: ["Ofertas"],
  request: {
    params: JoinCommunityParamsSchema,
    body: { content: { "application/json": { schema: RequestSeatBodySchema } } },
  },
  responses: {
    201: {
      description:
        "Solicitud pendiente con el punto de encuentro y la recogida calculados por el servidor",
      content: { "application/json": { schema: RequestSeatResponseSchema } },
    },
    401: apiErrorResponse("No hay sesión iniciada (`unauthorized`)"),
    403: apiErrorResponse("No puedes solicitar un asiento en este viaje (`forbidden`)"),
    404: apiErrorResponse("El viaje o la comunidad no existen (`offer_not_found`)"),
    409: apiErrorResponse("No se puede solicitar este asiento (`booking_conflict`)"),
    422: apiErrorResponse("Los datos enviados no son válidos (`validation_error`)"),
  },
});

export const acceptBookingRoute = createRoute({
  method: "post",
  path: "/bookings/{id}/accept",
  tags: ["Ofertas"],
  request: { params: JoinCommunityParamsSchema },
  responses: {
    200: {
      description: "Solicitud aceptada y asiento reservado",
      content: {
        "application/json": {
          schema: z
            .object({ booking: z.object({ id: z.string().uuid(), status: BookingStatusSchema }) })
            .openapi("AcceptBookingResponse"),
        },
      },
    },
  },
});

export const rejectBookingRoute = createRoute({
  method: "post",
  path: "/bookings/{id}/reject",
  tags: ["Ofertas"],
  request: { params: JoinCommunityParamsSchema },
  responses: {
    200: {
      description: "Solicitud rechazada",
      content: {
        "application/json": {
          schema: z
            .object({ booking: z.object({ id: z.string().uuid(), status: BookingStatusSchema }) })
            .openapi("RejectBookingResponse"),
        },
      },
    },
  },
});

export const StartTripResponseSchema = z
  .object({
    startedAt: z.string().datetime(),
    boarded: z.number().int(),
    message: z.string(),
  })
  .openapi("StartTripResponse");

export const startTripRoute = createRoute({
  method: "post",
  path: "/offers/{id}/start",
  tags: ["Ofertas"],
  request: { params: JoinCommunityParamsSchema },
  responses: {
    200: {
      description: "El viaje quedó en curso para los pasajeros aceptados",
      content: { "application/json": { schema: StartTripResponseSchema } },
    },
    401: apiErrorResponse("No hay sesión iniciada (`unauthorized`)"),
    403: apiErrorResponse("Solo quien conduce puede iniciar el viaje (`driver_required`)"),
    404: apiErrorResponse("El viaje no existe (`offer_not_found`)"),
    409: apiErrorResponse(
      "El viaje no se puede iniciar (`trip_too_early`: antes de 30 minutos de la salida; `trip_not_today`; `trip_cancelled`)",
    ),
    422: apiErrorResponse("El identificador no es válido (`validation_error`)"),
  },
});

export const TripProgressResponseSchema = z
  .object({
    booking: z.object({
      id: z.string().uuid(),
      status: BookingStatusSchema,
      startedAt: z.string().datetime().nullable(),
      arrivedAt: z.string().datetime().nullable(),
    }),
    message: z.string(),
  })
  .openapi("TripProgressResponse");

export const boardBookingRoute = createRoute({
  method: "post",
  path: "/bookings/{id}/board",
  tags: ["Ofertas"],
  request: { params: JoinCommunityParamsSchema },
  responses: {
    200: {
      description: "La persona confirmó que ya está en el auto",
      content: { "application/json": { schema: TripProgressResponseSchema } },
    },
    401: apiErrorResponse("No hay sesión iniciada (`unauthorized`)"),
    404: apiErrorResponse("La reserva no existe o no es de la persona (`booking_not_found`)"),
    409: apiErrorResponse(
      "No se puede marcar el viaje (`booking_not_accepted`: la solicitud no está aceptada; `trip_too_early`; `trip_not_today`; `trip_cancelled`)",
    ),
    422: apiErrorResponse("El identificador no es válido (`validation_error`)"),
  },
});

export const arriveBookingRoute = createRoute({
  method: "post",
  path: "/bookings/{id}/arrive",
  tags: ["Ofertas"],
  request: { params: JoinCommunityParamsSchema },
  responses: {
    200: {
      description: "La persona confirmó que llegó bien y la reserva quedó completada",
      content: { "application/json": { schema: TripProgressResponseSchema } },
    },
    401: apiErrorResponse("No hay sesión iniciada (`unauthorized`)"),
    404: apiErrorResponse("La reserva no existe o no es de la persona (`booking_not_found`)"),
    409: apiErrorResponse(
      "No se puede confirmar la llegada (`booking_not_accepted`: la solicitud no está aceptada; `trip_not_started`: el viaje todavía no empezó)",
    ),
    422: apiErrorResponse("El identificador no es válido (`validation_error`)"),
  },
});

export const noShowBookingRoute = createRoute({
  method: "post",
  path: "/bookings/{id}/no-show",
  tags: ["Ofertas"],
  request: { params: JoinCommunityParamsSchema },
  responses: {
    200: {
      description: "El conductor registró que la persona no se presentó",
      content: { "application/json": { schema: TripProgressResponseSchema } },
    },
    401: apiErrorResponse("No hay sesión iniciada (`unauthorized`)"),
    403: apiErrorResponse(
      "Solo quien conduce puede marcar que alguien no se presentó (`driver_required`)",
    ),
    404: apiErrorResponse("La reserva no existe (`booking_not_found`)"),
    409: apiErrorResponse(
      "No se puede marcar (`no_show_too_early`: antes de 10 minutos de la hora de recogida; `booking_not_accepted`; `booking_already_started`)",
    ),
    422: apiErrorResponse("El identificador no es válido (`validation_error`)"),
  },
});

export const QuickMessageSchema = z.enum([
  "Ya salí",
  "Estoy en el punto de encuentro",
  "Llego en 5 min",
  "Hoy no podré ir",
]);

export const TripMessageBodySchema = z.union([
  z.object({ kind: z.literal("text"), body: z.string().trim().min(1).max(500) }),
  z.object({ kind: z.literal("quick"), body: QuickMessageSchema }),
]);

export const TripMessageSchema = z.object({
  id: z.string().uuid(),
  senderName: z.string(),
  senderPhotoUrl: z.string().url().nullable(),
  senderRole: z.enum(["driver", "passenger"]),
  kind: z.enum(["text", "quick"]),
  body: z.string(),
  createdAt: z.string().datetime(),
});

export const listMyChatsRoute = createRoute({
  method: "get",
  path: "/me/chats",
  tags: ["Viajes"],
  responses: {
    200: {
      description: "Viajes con asiento aceptado",
      content: {
        "application/json": {
          schema: z
            .object({
              chats: z.array(
                z.object({
                  offerId: z.string().uuid(),
                  role: z.enum(["driver", "passenger"]),
                  driverName: z.string(),
                  driverPhotoUrl: z.string().url().nullable(),
                  communityName: z.string(),
                  originZoneName: z.string(),
                  destinationName: z.string(),
                  departureTime: z.string(),
                  date: z.string().nullable(),
                  daysOfWeek: z.array(z.number().int()).nullable(),
                  meetingPointName: z.string().nullable(),
                }),
              ),
            })
            .openapi("MyChatsResponse"),
        },
      },
    },
  },
});

export const tripMessagesRoute = createRoute({
  method: "get",
  path: "/offers/{id}/messages",
  tags: ["Viajes"],
  request: {
    params: JoinCommunityParamsSchema,
    query: z.object({ after: z.string().uuid().optional() }),
  },
  responses: {
    200: {
      description: "Mensajes y participantes aceptados del viaje",
      content: {
        "application/json": {
          schema: z
            .object({
              conversation: z.object({
                offerId: z.string().uuid(),
                communityName: z.string(),
                origin: z.string(),
                destination: z.string(),
                departureTime: z.string(),
                date: z.string().nullable(),
                daysOfWeek: z.array(z.number().int()).nullable(),
                role: z.enum(["driver", "passenger"]),
                participants: z.array(
                  z.object({
                    name: z.string(),
                    role: z.enum(["driver", "passenger"]),
                    photoUrl: z.string().url().nullable(),
                  }),
                ),
                meetingPoints: z.array(z.object({ participantName: z.string(), name: z.string() })),
              }),
              messages: z.array(TripMessageSchema),
            })
            .openapi("TripMessagesResponse"),
        },
      },
    },
  },
});

export const sendTripMessageRoute = createRoute({
  method: "post",
  path: "/offers/{id}/messages",
  tags: ["Viajes"],
  request: {
    params: JoinCommunityParamsSchema,
    body: { content: { "application/json": { schema: TripMessageBodySchema } } },
  },
  responses: {
    201: {
      description: "Mensaje enviado",
      content: {
        "application/json": {
          schema: z.object({ message: TripMessageSchema }).openapi("SendTripMessageResponse"),
        },
      },
    },
  },
});

export const listOfferBookingsRoute = createRoute({
  method: "get",
  path: "/offers/{id}/bookings",
  tags: ["Ofertas"],
  request: { params: JoinCommunityParamsSchema },
  responses: {
    200: {
      description: "Solicitudes visibles para el conductor del viaje",
      content: {
        "application/json": {
          schema: z
            .object({
              offerId: z.string().uuid(),
              seatsTaken: z.number().int(),
              seatsTotal: z.number().int(),
              bookings: z.array(
                z.object({
                  id: z.string().uuid(),
                  passengerName: z.string(),
                  passengerPhotoUrl: z.string().url().nullable(),
                  status: BookingStatusSchema,
                  meetingPointName: z.string(),
                  pickupAt: z.string(),
                  detourMinutes: z.number().int(),
                  message: z.string().nullable(),
                  avoidsCar: z.boolean(),
                  recommended: z.boolean(),
                }),
              ),
            })
            .openapi("OfferBookingsResponse"),
        },
      },
    },
  },
});

export const cancelBookingRoute = createRoute({
  method: "post",
  path: "/bookings/{id}/cancel",
  tags: ["Ofertas"],
  request: { params: JoinCommunityParamsSchema },
  responses: {
    200: {
      description: "La solicitud pendiente quedó retirada",
      content: {
        "application/json": {
          schema: z
            .object({ booking: z.object({ id: z.string().uuid(), status: BookingStatusSchema }) })
            .openapi("CancelBookingResponse"),
        },
      },
    },
    401: apiErrorResponse("No hay sesión iniciada (`unauthorized`)"),
    404: apiErrorResponse("La solicitud no existe (`booking_not_found`)"),
    409: apiErrorResponse("No se puede retirar esta solicitud (`booking_conflict`)"),
    422: apiErrorResponse("El identificador no es válido (`validation_error`)"),
  },
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

// A real calendar day: "2026-02-30" has the shape but not the day.
const isCalendarDate = (date: string) => {
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

// A journey: one direction on one date. Both strategies run on the same offers and needs.
export const RunMatchingBodySchema = z
  .object({
    direction: TripDirectionSchema,
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Ingresa una fecha válida.")
      .refine(isCalendarDate, "Ingresa una fecha válida."),
  })
  .openapi("RunMatchingRequest");

export const MatchRunSummarySchema = z
  .object({
    id: z.string().uuid(),
    carTripsAvoided: z.number().int(),
    passengersMatched: z.number().int(),
    // Every driver's together, against the trips with the passengers they had already accepted.
    detourMinutes: z.number().int(),
    walkMinutes: z.number().int(),
    // Needs that got no seat.
    unassigned: z.number().int(),
    offers: z.number().int(),
    requests: z.number().int(),
    durationMs: z.number().int(),
    createdAt: z.string(),
  })
  .openapi("MatchRunSummary");

export const MatchSuggestionStatusSchema = z.enum(["proposed", "accepted", "rejected"]);

// A recommendation: the driver still decides whether to accept the passenger.
export const MatchSuggestionSchema = z
  .object({
    id: z.string().uuid(),
    offerId: z.string().uuid(),
    driverName: z.string(),
    requestId: z.string().uuid(),
    passengerName: z.string(),
    meetingPointName: z.string(),
    pickupAt: z.string(),
    arrivalAt: z.string(),
    detourMinutes: z.number().int(),
    walkMinutes: z.number().int(),
    avoidsCarTrip: z.boolean(),
    status: MatchSuggestionStatusSchema,
  })
  .openapi("MatchSuggestion");

export const MatchRunsResponseSchema = z
  .object({
    direction: TripDirectionSchema,
    date: z.string(),
    optimizer: MatchRunSummarySchema,
    firstComeFirstServed: MatchRunSummarySchema,
    // The optimizer's recommendations; the baseline's are kept only for the comparison.
    suggestions: z.array(MatchSuggestionSchema),
  })
  .openapi("MatchRunsResponse");

export const runMatchingRoute = createRoute({
  method: "post",
  path: "/communities/{id}/match-runs",
  tags: ["Emparejamiento"],
  request: {
    params: JoinCommunityParamsSchema,
    body: { content: { "application/json": { schema: RunMatchingBodySchema } } },
  },
  responses: {
    201: {
      description:
        "Las dos corridas guardadas, optimizador y primero en llegar, con las asignaciones recomendadas",
      content: { "application/json": { schema: MatchRunsResponseSchema } },
    },
    401: apiErrorResponse("No hay sesión iniciada (`unauthorized`)"),
    403: apiErrorResponse(
      "No es miembro (`community_membership_required`) o no es administrador (`admin_required`)",
    ),
    404: apiErrorResponse("La comunidad no existe (`community_not_found`)"),
    409: apiErrorResponse(
      "Ya hay un emparejamiento en curso para esta jornada (`match_run_in_progress`), no hay ofertas ni necesidades (`no_journey_inputs`) o la sede no se puede usar (`unknown_destination`)",
    ),
    422: apiErrorResponse("Los datos enviados no son válidos (`validation_error`)"),
  },
});

export const latestMatchRunsRoute = createRoute({
  method: "get",
  path: "/communities/{id}/match-runs/latest",
  tags: ["Emparejamiento"],
  request: { params: JoinCommunityParamsSchema },
  responses: {
    200: {
      description: "La última jornada emparejada, con ambas corridas y sus recomendaciones",
      content: { "application/json": { schema: MatchRunsResponseSchema } },
    },
    401: apiErrorResponse("No hay sesión iniciada (`unauthorized`)"),
    403: apiErrorResponse(
      "No es miembro (`community_membership_required`) o no es administrador (`admin_required`)",
    ),
    404: apiErrorResponse(
      "La comunidad no existe (`community_not_found`) o nunca se ejecutó el emparejamiento (`no_match_runs`)",
    ),
    422: apiErrorResponse("El identificador no es válido (`validation_error`)"),
  },
});

// What Inicio shows a passenger the engine seated but who has not asked for the seat yet.
export const MatchProposalSchema = z
  .object({
    suggestionId: z.string().uuid(),
    offerId: z.string().uuid(),
    driverName: z.string(),
    driverPhotoUrl: z.string().url().nullable(),
    direction: TripDirectionSchema,
    date: z.string(),
    meetingPointName: z.string(),
    pickupAt: z.string(),
    arrivalAt: z.string(),
    walkMinutes: z.number().int(),
    fuelEstimate: FuelEstimateSchema,
  })
  .openapi("MatchProposal");

export const MatchProposalsResponseSchema = z
  .object({ proposals: z.array(MatchProposalSchema) })
  .openapi("MatchProposalsResponse");

export const listProposalsRoute = createRoute({
  method: "get",
  path: "/communities/{id}/proposals",
  tags: ["Emparejamiento"],
  request: { params: JoinCommunityParamsSchema },
  responses: {
    200: {
      description:
        "Los viajes recomendados a la persona en los que todavía no solicitó asiento, el más próximo primero",
      content: { "application/json": { schema: MatchProposalsResponseSchema } },
    },
    401: apiErrorResponse("No hay sesión iniciada (`unauthorized`)"),
    403: apiErrorResponse("No es miembro de la comunidad (`community_membership_required`)"),
    422: apiErrorResponse("El identificador no es válido (`validation_error`)"),
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

export const PublicStatsParamsSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/)
    .openapi({ param: { name: "slug", in: "path" } }),
});

const CarTripsAvoidedSchema = z.object({
  trips: z.number().int(),
  km: z.number(),
  co2Kg: z.number(),
});

const PublicStrategyCountsSchema = z.object({
  carTripsAvoided: z.number().int(),
  passengersMatched: z.number().int(),
});

export const PublicStatsSchema = z
  .object({
    community: z.object({ name: z.string(), isDemo: z.boolean() }),
    updatedAt: z.string().datetime(),
    activity: z.object({
      enrolled: z.number().int(),
      drivers: z.number().int(),
      activeOffers: z.number().int(),
      openNeeds: z.number().int(),
      // Share of open needs with a compatible offer, from 0 to 1; null while there are none.
      coverage: z.number().nullable(),
      acceptedRequests: z.number().int(),
      completedTrips: z.number().int(),
    }),
    waitlist: z.object({ institutions: z.number().int(), individuals: z.number().int() }),
    comparison: z
      .object({
        date: z.string(),
        direction: z.enum(["outbound", "return"]),
        optimizer: PublicStrategyCountsSchema,
        firstComeFirstServed: PublicStrategyCountsSchema,
      })
      .nullable(),
    // People who travel from each district; null stands for "menos de 10" (k ≥ 10, US-029).
    districts: z.array(z.object({ district: z.string(), people: z.number().int().nullable() })),
    people: z.object({ transported: z.number().int(), fromPublicTransport: z.number().int() }),
    vehicleImpact: z.object({
      potential: CarTripsAvoidedSchema,
      verified: CarTripsAvoidedSchema,
      induced: z.number().int(),
      net: z.number().int(),
    }),
  })
  .openapi("PublicStats");

export const publicStatsRoute = createRoute({
  method: "get",
  path: "/public/communities/{slug}/stats",
  tags: ["Público"],
  request: { params: PublicStatsParamsSchema },
  responses: {
    200: {
      description: "Cifras de impacto de la comunidad, sin cuentas del equipo ni datos personales",
      content: { "application/json": { schema: PublicStatsSchema } },
    },
    404: apiErrorResponse("Comunidad no encontrada"),
    422: apiErrorResponse("El identificador de la comunidad no es válido"),
    429: apiErrorResponse("Demasiadas consultas desde la misma IP"),
  },
});

export const CreateShareLinkResponseSchema = z
  .object({
    id: z.string().uuid(),
    // Shown once: only its hash is stored, so a lost link is replaced, not recovered.
    token: z.string(),
    expiresAt: z.iso.datetime(),
  })
  .openapi("CreateShareLinkResponse");

export const createShareLinkRoute = createRoute({
  method: "post",
  path: "/bookings/{id}/share-links",
  tags: ["Solicitudes"],
  request: { params: JoinCommunityParamsSchema },
  responses: {
    201: {
      description:
        "Enlace para compartir el viaje; reemplaza al anterior y vence al final del día del viaje",
      content: {
        "application/json": { schema: CreateShareLinkResponseSchema },
      },
    },
    401: apiErrorResponse("No hay sesión iniciada (`unauthorized`)"),
    404: apiErrorResponse("La reserva no existe o no es de la persona (`booking_not_found`)"),
    409: apiErrorResponse("El viaje no se puede compartir (`booking_not_shareable`)"),
    422: apiErrorResponse("El identificador no es válido (`validation_error`)"),
  },
});

export const revokeShareLinkRoute = createRoute({
  method: "delete",
  path: "/share-links/{id}",
  tags: ["Solicitudes"],
  request: { params: JoinCommunityParamsSchema },
  responses: {
    200: {
      description: "El enlace dejó de funcionar; repetir la acción no cambia nada",
      content: {
        "application/json": {
          schema: z
            .object({ id: z.string().uuid(), revokedAt: z.iso.datetime() })
            .openapi("RevokeShareLinkResponse"),
        },
      },
    },
    401: apiErrorResponse("No hay sesión iniciada (`unauthorized`)"),
    404: apiErrorResponse("El enlace no existe o no es de la persona (`share_link_not_found`)"),
    422: apiErrorResponse("El identificador no es válido (`validation_error`)"),
  },
});

export const SharedTripSchema = z
  .object({
    passengerAlias: z.string(),
    driverAlias: z.string(),
    vehicle: z.object({
      make: z.string(),
      model: z.string(),
      color: z.string(),
      plate: z.string(),
    }),
    meetingPointName: z.string(),
    // Time of day (HH:MM, Lima) the passenger is picked up.
    estimatedTime: z.string(),
    status: z.enum(["not_started", "in_progress", "arrived"]),
  })
  .openapi("SharedTrip");

export const sharedTripRoute = createRoute({
  method: "get",
  path: "/public/share/{token}",
  tags: ["Público"],
  request: {
    params: z.object({
      token: z
        .string()
        .regex(/^[A-Za-z0-9_-]{20,64}$/)
        .openapi({ param: { name: "token", in: "path" } }),
    }),
  },
  responses: {
    200: {
      description:
        "Lo mínimo para acompañar el viaje: alias, vehículo con placa, punto de encuentro, hora y estado. Sin correos, zonas de origen ni datos del pasajero más allá de su alias",
      content: { "application/json": { schema: SharedTripSchema } },
    },
    404: apiErrorResponse(
      "El enlace no existe, venció o se dejó de compartir; la respuesta es la misma en los tres casos (`share_link_unavailable`)",
    ),
    422: apiErrorResponse("El enlace no tiene un formato válido (`validation_error`)"),
    429: apiErrorResponse("Demasiadas consultas desde la misma IP (`too_many_share_requests`)"),
  },
});

const dataSourceFields = {
  id: z.string(),
  topic: z.enum(["tiempos", "impacto", "contexto"]),
  label: z.string(),
  // A rule rather than a number, like the interpolation, is written as text.
  value: z.union([z.number(), z.string()]),
  unit: z.string(),
  source: z.string(),
  // The day the team consulted the source, not the day it was published.
  date: z.iso.date(),
};

// `dato` has a source anyone can check at `url`; `estimado` is an assumption of the team.
export const DataSourceSchema = z
  .discriminatedUnion("kind", [
    z.object({ ...dataSourceFields, kind: z.literal("dato"), url: z.url() }),
    z.object({ ...dataSourceFields, kind: z.literal("estimado"), url: z.null() }),
  ])
  .openapi("DataSource");

export const DataSourcesResponseSchema = z
  .object({
    sources: z.array(DataSourceSchema),
  })
  .openapi("DataSourcesResponse");

export const dataSourcesRoute = createRoute({
  method: "get",
  path: "/public/data-sources",
  tags: ["Público"],
  responses: {
    200: {
      description: "Cada constante de los tiempos y del impacto, con su tipo, fuente y fecha",
      content: {
        "application/json": {
          schema: DataSourcesResponseSchema,
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
  deleteMeRoute,
  profilePhotoUploadRoute,
  confirmProfilePhotoRoute,
  getMyProfilePhotoRoute,
  deleteMyProfilePhotoRoute,
  updateMembershipRoute,
  updateTravelPreferencesRoute,
  listVehiclesRoute,
  createVehicleRoute,
  listCommunityZonesRoute,
  listCommunityOffersRoute,
  createCommunityOfferRoute,
  updateOfferStatusRoute,
  searchTripsRoute,
  getOfferDetailRoute,
  listMyTripsRoute,
  getMyImpactRoute,
  requestSeatRoute,
  acceptBookingRoute,
  rejectBookingRoute,
  startTripRoute,
  boardBookingRoute,
  arriveBookingRoute,
  noShowBookingRoute,
  listOfferBookingsRoute,
  cancelBookingRoute,
  runMatchingRoute,
  latestMatchRunsRoute,
  listProposalsRoute,
  listMyChatsRoute,
  tripMessagesRoute,
  sendTripMessageRoute,
  joinWaitlistRoute,
  waitlistSummaryRoute,
  publicStatsRoute,
  createShareLinkRoute,
  revokeShareLinkRoute,
  sharedTripRoute,
  dataSourcesRoute,
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

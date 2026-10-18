import {
  createCommunityOfferRoute,
  createVehicleRoute,
  getMeRoute,
  healthRoute,
  joinCommunityRoute,
  listCommunitiesRoute,
  listCommunityOffersRoute,
  listCommunityZonesRoute,
  listVehiclesRoute,
  OPENAPI_DOCUMENT_CONFIG,
  searchTripsRoute,
  updateMembershipRoute,
  updateOfferStatusRoute,
  verifyEmailCommunityRoute,
} from "@andes-hack/api";
import { auth as defaultAuth, createAuth, setVerificationOtpSender } from "@andes-hack/auth";
import { db as defaultDb } from "@andes-hack/db";
import { user as userTable } from "@andes-hack/db/schema/auth";
import { community, communityMember } from "@andes-hack/db/schema/community";
import { zone } from "@andes-hack/db/schema/places";
import { tripOffer } from "@andes-hack/db/schema/trips";
import { vehicle } from "@andes-hack/db/schema/vehicle";
import { env } from "@andes-hack/env/server";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { and, asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { sendEmail as defaultSendEmail, type SendEmailOptions } from "./lib/email";
import { getDownloadUrl } from "./lib/storage";
import {
  rateLimitMiddleware,
  requireOnboardedMember,
  requireSession,
  type RateLimitCheck,
  type SessionResolver,
} from "./middleware";
import { searchTrips } from "./search";
import { ApiError } from "./utils/api-response";
import { errorHandler, validationHook } from "./utils/error-handler";
import { createWaitlistRoutes } from "./waitlist";

setVerificationOtpSender(async ({ email, otp }) => {
  await defaultSendEmail({
    to: email,
    subject: "Tu código de verificación de Te Jalo",
    text: `Tu código de verificación de Te Jalo es ${otp}. Vence en 5 minutos.`,
  });
});

export type AppDeps = {
  db?: typeof defaultDb;
  getSession?: SessionResolver;
  rateLimit?: RateLimitCheck;
  joinRateLimit?: RateLimitCheck;
  otpRateLimit?: RateLimitCheck;
  sendEmail?: (options: SendEmailOptions) => Promise<unknown>;
  now?: () => Date;
  getDownloadUrl?: typeof getDownloadUrl;
};

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqualHex(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function isTeamEmail(
  email: string,
  rawTeamEmails = process.env.TEAM_EMAILS ?? env.TEAM_EMAILS,
): boolean {
  const normalized = email.trim().toLowerCase();
  return rawTeamEmails
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}

function extractEmailDomain(email: string): string | null {
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1 || atIndex === email.length - 1) return null;
  return email
    .slice(atIndex + 1)
    .trim()
    .toLowerCase();
}

function matchAllowedDomain(email: string | undefined, allowedDomains: string[]): string | null {
  if (!email) return null;
  const userDomain = extractEmailDomain(email);
  if (!userDomain) return null;
  const match = allowedDomains.find((d) => d.trim().toLowerCase() === userDomain);
  return match ? `@${match.trim().toLowerCase()}` : null;
}

export function createApp(deps: AppDeps = {}) {
  const database = deps.db ?? defaultDb;
  const emailSender = deps.sendEmail ?? defaultSendEmail;
  const getNow = deps.now ?? (() => new Date());
  const signPhotoUrl = deps.getDownloadUrl ?? getDownloadUrl;
  const authInstance =
    deps.db || deps.sendEmail
      ? createAuth({
          db: database,
          sendVerificationOTP: async ({ email, otp }) => {
            await emailSender({
              to: email,
              subject: "Tu código de verificación de Te Jalo",
              text: `Tu código de verificación de Te Jalo es ${otp}. Vence en 5 minutos.`,
            });
          },
        })
      : defaultAuth;

  const resolveOptionalSession: SessionResolver =
    deps.getSession ??
    (async (headers) => {
      return authInstance.api.getSession({ headers });
    });

  const app = new Hono();

  app.onError(errorHandler);
  app.use(
    "/*",
    cors({
      origin: env.CORS_ORIGIN,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "x-community-id"],
      credentials: true,
    }),
  );
  app.use("/*", rateLimitMiddleware(deps.rateLimit, deps.getSession));

  app.post("/api/auth/email-otp/send-verification-otp", async (c, next) => {
    const session = await resolveOptionalSession(c.req.raw.headers);
    const cloned = c.req.raw.clone();
    const payload = (await cloned.json().catch(() => ({}))) as {
      email?: string;
      communityId?: string;
    };
    const candidateEmail = (session?.user?.email ?? payload.email ?? "").trim();

    const communityIdHeader = c.req.header("x-community-id") ?? payload.communityId;
    if (communityIdHeader) {
      const [org] = await database
        .select({
          id: community.id,
          name: community.name,
          allowedEmailDomains: community.allowedEmailDomains,
        })
        .from(community)
        .where(eq(community.id, communityIdHeader))
        .limit(1);

      if (!org) {
        throw new ApiError(404, "Comunidad no encontrada.", { code: "community_not_found" });
      }

      if (!matchAllowedDomain(candidateEmail, org.allowedEmailDomains)) {
        throw new ApiError(
          403,
          `Tu cuenta usa un correo que no pertenece a ${org.name}. Crea tu cuenta con tu correo institucional.`,
          { code: "email_domain_not_allowed" },
        );
      }
    }

    const checkOtpLimit: RateLimitCheck =
      deps.otpRateLimit ??
      deps.rateLimit ??
      (async (key) => {
        const { checkOtpSendRateLimit } = await import("./lib/rate-limit");
        return checkOtpSendRateLimit(key);
      });
    const rateKey = `otp:${session?.user?.id ?? candidateEmail.toLowerCase()}`;
    const otpLimit = await checkOtpLimit(rateKey);
    if (!otpLimit.success) {
      c.header("Retry-After", String(Math.max(1, Math.ceil((otpLimit.reset - Date.now()) / 1000))));
      throw new ApiError(429, "Demasiados intentos. Espera unos minutos.", {
        code: "otp_rate_limited",
      });
    }

    await next();
  });

  app.on(["POST", "GET"], "/api/auth/*", (c) => authInstance.handler(c.req.raw));

  const checkOnboarded = async (userId: string, communityId: string) => {
    const [row] = await database
      .select({
        consentAt: communityMember.consentAt,
        usualMode: communityMember.usualMode,
      })
      .from(communityMember)
      .where(and(eq(communityMember.communityId, communityId), eq(communityMember.userId, userId)))
      .limit(1);
    if (!row) return { isMember: false, isOnboarded: false };
    return {
      isMember: true,
      isOnboarded: row.consentAt != null && row.usualMode != null,
    };
  };

  const openApiApp = new OpenAPIHono({ defaultHook: validationHook });
  openApiApp.use("/communities/:id/join", requireSession(deps.getSession));
  openApiApp.use("/communities/:id/verify-email", requireSession(deps.getSession));
  openApiApp.use("/communities/:id/membership", requireSession(deps.getSession));
  openApiApp.use(
    "/communities/:id/zones",
    requireSession(deps.getSession),
    requireOnboardedMember((c) => c.req.param("id") ?? "", checkOnboarded),
  );
  openApiApp.use(
    "/communities/:id/offers",
    requireSession(deps.getSession),
    requireOnboardedMember((c) => c.req.param("id") ?? "", checkOnboarded),
  );
  openApiApp.use(
    "/communities/:id/search",
    requireSession(deps.getSession),
    requireOnboardedMember((c) => c.req.param("id") ?? "", checkOnboarded),
  );
  openApiApp.use("/vehicles", requireSession(deps.getSession));
  openApiApp.use("/offers/:id/status", requireSession(deps.getSession));
  openApiApp.use("/me", requireSession(deps.getSession));

  openApiApp.openapi(healthRoute, (c) => {
    return c.json({ status: "ok" as const });
  });

  openApiApp.openapi(listCommunitiesRoute, async (c) => {
    const session = await resolveOptionalSession(c.req.raw.headers).catch(() => null);
    const rows = await database
      .select({
        id: community.id,
        name: community.name,
        kind: community.kind,
        isDemo: community.isDemo,
        allowedEmailDomains: community.allowedEmailDomains,
      })
      .from(community)
      .orderBy(asc(community.name));

    return c.json(
      {
        communities: rows.map((row) => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          isDemo: row.isDemo,
          hasEmailVerification: row.allowedEmailDomains.length > 0,
          matchedEmailDomain: matchAllowedDomain(session?.user?.email, row.allowedEmailDomains),
        })),
      },
      200,
    );
  });

  openApiApp.openapi(joinCommunityRoute, async (c) => {
    const { id: communityId } = c.req.valid("param");
    const { code } = c.req.valid("json");
    const sessionUser = c.get("user");

    const [org] = await database
      .select({
        id: community.id,
        name: community.name,
        joinCodeHash: community.joinCodeHash,
      })
      .from(community)
      .where(eq(community.id, communityId))
      .limit(1);

    if (!org) {
      throw new ApiError(404, "Comunidad no encontrada.", { code: "community_not_found" });
    }

    const [existing] = await database
      .select({
        verificationMethod: communityMember.verificationMethod,
        isTeam: communityMember.isTeam,
      })
      .from(communityMember)
      .where(
        and(eq(communityMember.communityId, org.id), eq(communityMember.userId, sessionUser.id)),
      )
      .limit(1);

    if (existing) {
      return c.json(
        {
          joined: true as const,
          alreadyMember: true,
          communityId: org.id,
          communityName: org.name,
          verificationMethod: existing.verificationMethod,
          isTeam: existing.isTeam,
          message: `¡Listo! Ya eres parte de ${org.name}.`,
        },
        200,
      );
    }

    const checkJoinLimit: RateLimitCheck =
      deps.joinRateLimit ??
      deps.rateLimit ??
      (async (key) => {
        const { checkJoinAttemptRateLimit } = await import("./lib/rate-limit");
        return checkJoinAttemptRateLimit(key);
      });
    const joinLimitResult = await checkJoinLimit(`join:${sessionUser.id}:${org.id}`);
    if (!joinLimitResult.success) {
      c.header(
        "Retry-After",
        String(Math.max(1, Math.ceil((joinLimitResult.reset - Date.now()) / 1000))),
      );
      throw new ApiError(429, "Demasiados intentos. Espera unos minutos.", {
        code: "too_many_join_attempts",
      });
    }

    const candidateHash = await sha256Hex(code.trim());
    if (!org.joinCodeHash || !constantTimeEqualHex(candidateHash, org.joinCodeHash.toLowerCase())) {
      throw new ApiError(400, "El código no es válido para esta comunidad.", {
        code: "invalid_join_code",
      });
    }

    const teamMember = isTeamEmail(sessionUser.email);
    await database
      .insert(communityMember)
      .values({
        communityId: org.id,
        userId: sessionUser.id,
        verificationMethod: "join_code",
        isTeam: teamMember,
      })
      .onConflictDoNothing();

    return c.json(
      {
        joined: true as const,
        alreadyMember: false,
        communityId: org.id,
        communityName: org.name,
        verificationMethod: "join_code" as const,
        isTeam: teamMember,
        message: `¡Listo! Ya eres parte de ${org.name}.`,
      },
      200,
    );
  });

  openApiApp.openapi(verifyEmailCommunityRoute, async (c) => {
    const { id: communityId } = c.req.valid("param");
    const sessionUser = c.get("user");

    const [org] = await database
      .select({
        id: community.id,
        name: community.name,
        allowedEmailDomains: community.allowedEmailDomains,
      })
      .from(community)
      .where(eq(community.id, communityId))
      .limit(1);

    if (!org) {
      throw new ApiError(404, "Comunidad no encontrada.", { code: "community_not_found" });
    }

    const [dbUser] = await database
      .select({
        id: userTable.id,
        email: userTable.email,
        emailVerified: userTable.emailVerified,
      })
      .from(userTable)
      .where(eq(userTable.id, sessionUser.id))
      .limit(1);

    const userEmail = dbUser?.email ?? sessionUser.email;
    if (!matchAllowedDomain(userEmail, org.allowedEmailDomains)) {
      throw new ApiError(
        403,
        `Tu cuenta usa un correo que no pertenece a ${org.name}. Crea tu cuenta con tu correo institucional.`,
        { code: "email_domain_not_allowed" },
      );
    }

    if (!dbUser?.emailVerified) {
      throw new ApiError(400, "El código no es válido o ya venció.", {
        code: "email_not_verified",
      });
    }

    const [existing] = await database
      .select({
        verificationMethod: communityMember.verificationMethod,
        isTeam: communityMember.isTeam,
      })
      .from(communityMember)
      .where(
        and(eq(communityMember.communityId, org.id), eq(communityMember.userId, sessionUser.id)),
      )
      .limit(1);

    if (existing) {
      return c.json(
        {
          joined: true as const,
          alreadyMember: true,
          communityId: org.id,
          communityName: org.name,
          verificationMethod: existing.verificationMethod,
          isTeam: existing.isTeam,
          message: "Pertenencia verificada.",
        },
        200,
      );
    }

    const teamMember = isTeamEmail(userEmail);
    await database
      .insert(communityMember)
      .values({
        communityId: org.id,
        userId: sessionUser.id,
        verificationMethod: "email_domain",
        isTeam: teamMember,
      })
      .onConflictDoNothing();

    return c.json(
      {
        joined: true as const,
        alreadyMember: false,
        communityId: org.id,
        communityName: org.name,
        verificationMethod: "email_domain" as const,
        isTeam: teamMember,
        message: "Pertenencia verificada.",
      },
      200,
    );
  });

  openApiApp.openapi(getMeRoute, async (c) => {
    const sessionUser = c.get("user");
    const rows = await database
      .select({
        id: communityMember.id,
        communityId: communityMember.communityId,
        communityName: community.name,
        destinationName: community.destinationName,
        role: communityMember.role,
        verificationMethod: communityMember.verificationMethod,
        consentVersion: communityMember.consentVersion,
        consentAt: communityMember.consentAt,
        usualMode: communityMember.usualMode,
        travelRole: communityMember.travelRole,
        alias: communityMember.alias,
        identifiesAsWoman: communityMember.identifiesAsWoman,
        womenOnly: communityMember.womenOnly,
        isTeam: communityMember.isTeam,
      })
      .from(communityMember)
      .innerJoin(community, eq(communityMember.communityId, community.id))
      .where(eq(communityMember.userId, sessionUser.id))
      .orderBy(asc(communityMember.createdAt));

    return c.json(
      {
        user: {
          id: sessionUser.id,
          name: sessionUser.name,
          email: sessionUser.email,
        },
        memberships: rows.map((row) => ({
          id: row.id,
          communityId: row.communityId,
          communityName: row.communityName,
          destinationName: row.destinationName,
          role: row.role,
          verificationMethod: row.verificationMethod,
          consentVersion: row.consentVersion,
          consentAt: row.consentAt ? row.consentAt.toISOString() : null,
          usualMode: row.usualMode,
          travelRole: row.travelRole,
          alias: row.alias,
          identifiesAsWoman: row.identifiesAsWoman,
          womenOnly: row.womenOnly,
          isTeam: row.isTeam,
        })),
      },
      200,
    );
  });

  openApiApp.openapi(updateMembershipRoute, async (c) => {
    const { id: communityId } = c.req.valid("param");
    const body = c.req.valid("json");
    const sessionUser = c.get("user");

    const [org] = await database
      .select({
        id: community.id,
        name: community.name,
        destinationName: community.destinationName,
      })
      .from(community)
      .where(eq(community.id, communityId))
      .limit(1);

    if (!org) {
      throw new ApiError(404, "Comunidad no encontrada.", { code: "community_not_found" });
    }

    const [existing] = await database
      .select({ id: communityMember.id })
      .from(communityMember)
      .where(
        and(eq(communityMember.communityId, org.id), eq(communityMember.userId, sessionUser.id)),
      )
      .limit(1);

    if (!existing) {
      throw new ApiError(403, "No perteneces a esta comunidad.", {
        code: "community_membership_required",
      });
    }

    const consentTime = getNow();
    const [updated] = await database
      .update(communityMember)
      .set({
        consentVersion: "v1",
        consentAt: consentTime,
        usualMode: body.usualMode,
        travelRole: body.travelRole,
        alias: body.alias ?? null,
        updatedAt: consentTime,
      })
      .where(eq(communityMember.id, existing.id))
      .returning();

    return c.json(
      {
        id: updated!.id,
        communityId: org.id,
        communityName: org.name,
        destinationName: org.destinationName,
        role: updated!.role,
        verificationMethod: updated!.verificationMethod,
        consentVersion: updated!.consentVersion,
        consentAt: updated!.consentAt ? updated!.consentAt.toISOString() : null,
        usualMode: updated!.usualMode,
        travelRole: updated!.travelRole,
        alias: updated!.alias,
        identifiesAsWoman: updated!.identifiesAsWoman,
        womenOnly: updated!.womenOnly,
        isTeam: updated!.isTeam,
      },
      200,
    );
  });

  openApiApp.openapi(listVehiclesRoute, async (c) => {
    const sessionUser = c.get("user");
    const rows = await database
      .select({
        id: vehicle.id,
        plate: vehicle.plate,
        make: vehicle.make,
        model: vehicle.model,
        color: vehicle.color,
        seats: vehicle.seats,
      })
      .from(vehicle)
      .where(eq(vehicle.ownerId, sessionUser.id))
      .orderBy(asc(vehicle.createdAt));

    return c.json({ vehicles: rows }, 200);
  });

  openApiApp.openapi(createVehicleRoute, async (c) => {
    const body = c.req.valid("json");
    const sessionUser = c.get("user");

    const [existingPlate] = await database
      .select({ id: vehicle.id })
      .from(vehicle)
      .where(eq(vehicle.plate, body.plate))
      .limit(1);

    if (existingPlate) {
      throw new ApiError(409, "Esta placa ya está registrada.", {
        code: "plate_already_registered",
      });
    }

    const rawMakeModel = (body.makeModel ?? "").trim();
    const firstSpace = rawMakeModel.indexOf(" ");
    const make =
      body.make?.trim() ||
      (firstSpace === -1 ? rawMakeModel : rawMakeModel.slice(0, firstSpace).trim());
    const model =
      body.model?.trim() ||
      (firstSpace === -1 ? make : rawMakeModel.slice(firstSpace + 1).trim() || make);

    const [created] = await database
      .insert(vehicle)
      .values({
        ownerId: sessionUser.id,
        plate: body.plate,
        make,
        model,
        color: body.color.trim(),
        seats: body.seats,
      })
      .returning();

    return c.json(
      {
        id: created!.id,
        plate: created!.plate,
        make: created!.make,
        model: created!.model,
        color: created!.color,
        seats: created!.seats,
      },
      201,
    );
  });

  openApiApp.openapi(listCommunityZonesRoute, async (c) => {
    let rows = await database
      .select({
        id: zone.id,
        name: zone.name,
        district: zone.district,
        lat: zone.lat,
        lng: zone.lng,
      })
      .from(zone)
      .orderBy(asc(zone.name));

    if (rows.length === 0) {
      await database
        .insert(zone)
        .values([
          {
            id: "san-isidro",
            name: "San Isidro (Óvalo Gutiérrez)",
            district: "San Isidro",
            lat: -12.1049,
            lng: -77.0372,
          },
          {
            id: "miraflores",
            name: "Miraflores (Parque Kennedy)",
            district: "Miraflores",
            lat: -12.1211,
            lng: -77.0294,
          },
          {
            id: "surco",
            name: "Surco (Óvalo Higuereta)",
            district: "Santiago de Surco",
            lat: -12.1277,
            lng: -77.0014,
          },
          {
            id: "la-molina",
            name: "La Molina (Óvalo Monitor)",
            district: "La Molina",
            lat: -12.0853,
            lng: -76.9682,
          },
          {
            id: "san-borja",
            name: "San Borja (La Cultura)",
            district: "San Borja",
            lat: -12.0897,
            lng: -77.0031,
          },
        ])
        .onConflictDoNothing();

      rows = await database
        .select({
          id: zone.id,
          name: zone.name,
          district: zone.district,
          lat: zone.lat,
          lng: zone.lng,
        })
        .from(zone)
        .orderBy(asc(zone.name));
    }

    return c.json({ zones: rows }, 200);
  });

  openApiApp.openapi(listCommunityOffersRoute, async (c) => {
    const { id: communityId } = c.req.valid("param");
    const sessionUser = c.get("user");

    const rows = await database
      .select({
        id: tripOffer.id,
        communityId: tripOffer.communityId,
        driverId: tripOffer.driverId,
        vehicleId: tripOffer.vehicleId,
        direction: tripOffer.direction,
        originZoneId: tripOffer.originZoneId,
        originZoneName: zone.name,
        departureTime: tripOffer.departureTime,
        daysOfWeek: tripOffer.daysOfWeek,
        date: tripOffer.date,
        seatsTotal: tripOffer.seatsTotal,
        seatsTaken: tripOffer.seatsTaken,
        maxDetourMinutes: tripOffer.maxDetourMinutes,
        womenOnly: tripOffer.womenOnly,
        note: tripOffer.note,
        status: tripOffer.status,
      })
      .from(tripOffer)
      .leftJoin(zone, eq(tripOffer.originZoneId, zone.id))
      .where(and(eq(tripOffer.communityId, communityId), eq(tripOffer.driverId, sessionUser.id)))
      .orderBy(desc(tripOffer.createdAt));

    return c.json(
      {
        offers: rows.map((row) => ({
          ...row,
          originZoneName: row.originZoneName ?? row.originZoneId,
        })),
      },
      200,
    );
  });

  openApiApp.openapi(createCommunityOfferRoute, async (c) => {
    const { id: communityId } = c.req.valid("param");
    const body = c.req.valid("json");
    const sessionUser = c.get("user");

    const [car] = await database
      .select({
        id: vehicle.id,
        ownerId: vehicle.ownerId,
        seats: vehicle.seats,
      })
      .from(vehicle)
      .where(and(eq(vehicle.id, body.vehicleId), eq(vehicle.ownerId, sessionUser.id)))
      .limit(1);

    if (!car) {
      throw new ApiError(404, "Vehículo no encontrado.", { code: "vehicle_not_found" });
    }

    if (body.seatsTotal > car.seats) {
      throw new ApiError(400, "No puedes ofrecer más asientos de los que tiene tu vehículo.", {
        code: "seats_exceed_vehicle_capacity",
      });
    }

    if (body.date) {
      const todayLima = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Lima",
      }).format(getNow());
      if (body.date < todayLima) {
        throw new ApiError(400, "La fecha del viaje no puede estar en el pasado.", {
          code: "past_offer_date",
        });
      }
    }

    const [membership] = await database
      .select({ identifiesAsWoman: communityMember.identifiesAsWoman })
      .from(communityMember)
      .where(
        and(
          eq(communityMember.communityId, communityId),
          eq(communityMember.userId, sessionUser.id),
        ),
      )
      .limit(1);

    if (body.womenOnly && !membership?.identifiesAsWoman) {
      throw new ApiError(
        403,
        "Esta preferencia solo está disponible para quienes la activaron en su perfil.",
        { code: "women_only_not_allowed" },
      );
    }

    const [zoneRow] = await database
      .select({ name: zone.name })
      .from(zone)
      .where(eq(zone.id, body.originZoneId))
      .limit(1);

    const [created] = await database
      .insert(tripOffer)
      .values({
        communityId,
        driverId: sessionUser.id,
        vehicleId: car.id,
        direction: body.direction,
        originZoneId: body.originZoneId,
        departureTime: body.departureTime,
        daysOfWeek: body.daysOfWeek ?? null,
        date: body.date ?? null,
        seatsTotal: body.seatsTotal,
        seatsTaken: 0,
        maxDetourMinutes: body.maxDetourMinutes,
        womenOnly: body.womenOnly,
        note: body.note?.trim() || null,
        status: "active",
      })
      .returning();

    return c.json(
      {
        offer: {
          id: created!.id,
          communityId: created!.communityId,
          driverId: created!.driverId,
          vehicleId: created!.vehicleId,
          direction: created!.direction,
          originZoneId: created!.originZoneId,
          originZoneName: zoneRow?.name ?? created!.originZoneId,
          departureTime: created!.departureTime,
          daysOfWeek: created!.daysOfWeek,
          date: created!.date,
          seatsTotal: created!.seatsTotal,
          seatsTaken: created!.seatsTaken,
          maxDetourMinutes: created!.maxDetourMinutes,
          womenOnly: created!.womenOnly,
          note: created!.note,
          status: created!.status,
        },
        message: "Viaje publicado.",
      },
      201,
    );
  });

  openApiApp.openapi(searchTripsRoute, async (c) => {
    const { id: communityId } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(
      await searchTrips(database, { communityId, userId: c.get("user").id, body }, signPhotoUrl),
      200,
    );
  });

  openApiApp.openapi(updateOfferStatusRoute, async (c) => {
    const { id: offerId } = c.req.valid("param");
    const { status } = c.req.valid("json");
    const sessionUser = c.get("user");

    const [existing] = await database
      .select({ id: tripOffer.id, driverId: tripOffer.driverId })
      .from(tripOffer)
      .where(eq(tripOffer.id, offerId))
      .limit(1);

    if (!existing) {
      throw new ApiError(404, "Oferta no encontrada.", { code: "offer_not_found" });
    }

    if (existing.driverId !== sessionUser.id) {
      throw new ApiError(403, "No tienes permiso para modificar esta oferta.", {
        code: "forbidden",
      });
    }

    const [updated] = await database
      .update(tripOffer)
      .set({ status, updatedAt: getNow() })
      .where(eq(tripOffer.id, offerId))
      .returning();

    return c.json(
      {
        id: updated!.id,
        communityId: updated!.communityId,
        driverId: updated!.driverId,
        vehicleId: updated!.vehicleId,
        direction: updated!.direction,
        originZoneId: updated!.originZoneId,
        departureTime: updated!.departureTime,
        daysOfWeek: updated!.daysOfWeek,
        date: updated!.date,
        seatsTotal: updated!.seatsTotal,
        seatsTaken: updated!.seatsTaken,
        maxDetourMinutes: updated!.maxDetourMinutes,
        womenOnly: updated!.womenOnly,
        note: updated!.note,
        status: updated!.status,
      },
      200,
    );
  });

  openApiApp.route("/", createWaitlistRoutes({ db: deps.db }));

  openApiApp.doc31("/openapi.json", OPENAPI_DOCUMENT_CONFIG);
  openApiApp.get("/docs", apiReference({ spec: { url: "/openapi.json" } }));
  app.route("/", openApiApp);

  app.get("/", (c) => {
    return c.text("OK");
  });

  return app;
}

const app = createApp();

export default app;

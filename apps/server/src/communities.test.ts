import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    BETTER_AUTH_SECRET: "vitest-secret-with-at-least-thirty-two-characters",
    BETTER_AUTH_URL: "http://localhost:3000",
    UPSTASH_REDIS_REST_URL: "https://example.com",
    UPSTASH_REDIS_REST_TOKEN: "vitest-token",
    CORS_ORIGIN: "http://localhost:3001",
    TEAM_EMAILS: "equipo@tejalo.pe,admin@tejalo.pe",
    NODE_ENV: "test",
  });
});

import { user } from "@andes-hack/db/schema/auth";
import { community, communityMember } from "@andes-hack/db/schema/community";
import { createTestDb } from "@andes-hack/db/test-db";

import { createApp } from "./index";

let testDb: Awaited<ReturnType<typeof createTestDb>>["db"];
let closeDb: () => Promise<void>;

beforeAll(async () => {
  const instance = await createTestDb();
  testDb = instance.db;
  closeDb = instance.close;
});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await testDb.delete(community);
});

describe("GET /communities (US-009)", () => {
  it("lists communities with only public fields and never exposes join codes or email domains", async () => {
    const [alfa] = await testDb
      .insert(community)
      .values({
        slug: "comunidad-alfa",
        name: "Comunidad Alfa",
        kind: "company",
        destinationName: "Centro Empresarial Real",
        destinationLat: -12.0975,
        destinationLng: -77.0356,
        allowedEmailDomains: ["alfa.pe"],
        joinCodeHash: "secret-hash-value",
        isDemo: true,
      })
      .returning();

    const app = createApp({
      db: testDb as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
    });

    const response = await app.request("/communities");

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      communities: Array<Record<string, unknown>>;
    };
    expect(body).toEqual({
      communities: [
        {
          id: alfa!.id,
          name: "Comunidad Alfa",
          slug: "comunidad-alfa",
          kind: "company",
          isDemo: true,
          hasEmailVerification: true,
          matchedEmailDomain: null,
        },
      ],
    });
    expect(body.communities[0]).not.toHaveProperty("joinCodeHash");
    expect(body.communities[0]).not.toHaveProperty("allowedEmailDomains");
  });
});

describe("POST /communities/{id}/join (US-009)", () => {
  it("verifies membership with SHA-256 join_code, is idempotent, and sets is_team only from TEAM_EMAILS", async () => {
    await testDb.delete(communityMember);
    await testDb.delete(user);

    // Known literal SHA-256 hex of "ALFA2026"
    const joinCodeHash = "a713b09644f93d06ee6458195592400b1b76babb9beecae5064d9376dfdab704";

    const [alfa] = await testDb
      .insert(community)
      .values({
        slug: "comunidad-alfa",
        name: "Comunidad Alfa",
        kind: "company",
        destinationName: "Centro Empresarial Real",
        destinationLat: -12.0975,
        destinationLng: -77.0356,
        joinCodeHash,
        isDemo: true,
      })
      .returning();

    const [regularUser] = await testDb
      .insert(user)
      .values({ id: "u-regular", name: "Carlos", email: "carlos@alfa.pe" })
      .returning();
    const [teamUser] = await testDb
      .insert(user)
      .values({ id: "u-team", name: "Diego", email: "EQUIPO@tejalo.pe" })
      .returning();

    let activeUser = regularUser!;
    const app = createApp({
      db: testDb as never,
      getSession: async () => ({ user: activeUser }) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
    });

    const firstJoin = await app.request(`/communities/${alfa!.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ALFA2026", isTeam: true }),
    });

    expect(firstJoin.status).toBe(200);
    expect(await firstJoin.json()).toEqual({
      joined: true,
      alreadyMember: false,
      communityId: alfa!.id,
      communityName: "Comunidad Alfa",
      verificationMethod: "join_code",
      isTeam: false,
      message: "¡Listo! Ya eres parte de Comunidad Alfa.",
    });

    const secondJoin = await app.request(`/communities/${alfa!.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "CUALQUIER_OTRO" }),
    });

    expect(secondJoin.status).toBe(200);
    expect(await secondJoin.json()).toEqual({
      joined: true,
      alreadyMember: true,
      communityId: alfa!.id,
      communityName: "Comunidad Alfa",
      verificationMethod: "join_code",
      isTeam: false,
      message: "¡Listo! Ya eres parte de Comunidad Alfa.",
    });

    activeUser = teamUser!;
    const teamJoin = await app.request(`/communities/${alfa!.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ALFA2026" }),
    });

    expect(teamJoin.status).toBe(200);
    expect(await teamJoin.json()).toMatchObject({
      joined: true,
      alreadyMember: false,
      verificationMethod: "join_code",
      isTeam: true,
    });
  });

  it("blocks brute-force attempts with 429 after 5 failed codes in 10 minutes even if the 6th code is valid", async () => {
    await testDb.delete(communityMember);
    await testDb.delete(user);

    const joinCodeHash = "a713b09644f93d06ee6458195592400b1b76babb9beecae5064d9376dfdab704";
    const [alfa] = await testDb
      .insert(community)
      .values({
        slug: "comunidad-alfa",
        name: "Comunidad Alfa",
        kind: "company",
        destinationName: "Centro Empresarial Real",
        destinationLat: -12.0975,
        destinationLng: -77.0356,
        joinCodeHash,
        isDemo: true,
      })
      .returning();

    const [person] = await testDb
      .insert(user)
      .values({ id: "u-brute", name: "Luis", email: "luis@alfa.pe" })
      .returning();

    const attemptsByKey = new Map<string, number>();
    const app = createApp({
      db: testDb as never,
      getSession: async () => ({ user: person! }) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
      joinRateLimit: async (key) => {
        const count = (attemptsByKey.get(key) ?? 0) + 1;
        attemptsByKey.set(key, count);
        return {
          success: count <= 5,
          reset: Date.now() + 600_000,
        };
      },
    });

    for (let i = 1; i <= 5; i += 1) {
      const wrong = await app.request(`/communities/${alfa!.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: `WRONG00${i}` }),
      });
      expect(wrong.status).toBe(400);
      expect(await wrong.json()).toEqual({
        success: false,
        status: 400,
        error: "El código no es válido para esta comunidad.",
        details: { code: "invalid_join_code" },
      });
    }

    const sixthAttemptWithValidCode = await app.request(`/communities/${alfa!.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ALFA2026" }),
    });

    expect(sixthAttemptWithValidCode.status).toBe(429);
    expect(await sixthAttemptWithValidCode.json()).toEqual({
      success: false,
      status: 429,
      error: "Demasiados intentos. Espera unos minutos.",
      details: { code: "too_many_join_attempts" },
    });

    // Public seam verification that the 6th request did not create a membership:
    attemptsByKey.clear();
    const afterWindowReset = await app.request(`/communities/${alfa!.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "STILL_NOT_A_MEMBER" }),
    });
    expect(afterWindowReset.status).toBe(400);
  });
});

describe("Institutional email OTP verification (US-010)", () => {
  it("sends a 6-digit OTP via sendEmail, verifies email via better-auth, and creates membership with email_domain", async () => {
    await testDb.delete(communityMember);
    await testDb.delete(user);

    const [uni] = await testDb
      .insert(community)
      .values({
        slug: "uni-nacional",
        name: "Universidad Nacional",
        kind: "university",
        destinationName: "Campus Central",
        destinationLat: -12.016,
        destinationLng: -77.05,
        allowedEmailDomains: ["UNI.EDU.PE"],
        isDemo: false,
      })
      .returning();

    const [ana] = await testDb
      .insert(user)
      .values({
        id: "u-ana",
        name: "Ana",
        email: "ana@uni.edu.pe",
        emailVerified: false,
      })
      .returning();

    const sentEmails: Array<{ to: string | string[]; subject: string; text?: string }> = [];
    const app = createApp({
      db: testDb as never,
      getSession: async () => ({ user: ana! }) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
      sendEmail: async (options) => {
        sentEmails.push(options);
        return { success: true, data: { id: "email-1" } };
      },
    });

    // 1. GET /communities exposes hasEmailVerification and matchedEmailDomain for the signed-in user, never allowedEmailDomains
    const listRes = await app.request("/communities");
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      communities: Array<Record<string, unknown>>;
    };
    expect(listBody.communities[0]).toEqual({
      id: uni!.id,
      name: "Universidad Nacional",
      slug: "uni-nacional",
      kind: "university",
      isDemo: false,
      hasEmailVerification: true,
      matchedEmailDomain: "@uni.edu.pe",
    });
    expect(listBody.communities[0]).not.toHaveProperty("allowedEmailDomains");

    // 2. Request OTP via better-auth endpoint
    const sendOtpRes = await app.request("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-community-id": uni!.id,
      },
      body: JSON.stringify({
        email: "Ana@UNI.EDU.PE",
        type: "email-verification",
      }),
    });

    expect(sendOtpRes.status).toBe(200);
    expect(sentEmails).toHaveLength(1);
    const otpMatch = sentEmails[0]!.text?.match(/\b(\d{6})\b/);
    expect(otpMatch).not.toBeNull();
    const otpCode = otpMatch![1]!;

    // 3. Verify OTP via better-auth endpoint
    const verifyOtpRes = await app.request("/api/auth/email-otp/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "Ana@UNI.EDU.PE",
        otp: otpCode,
      }),
    });
    expect(verifyOtpRes.status).toBe(200);

    // 4. Confirm institutional membership
    const joinEmailRes = await app.request(`/communities/${uni!.id}/verify-email`, {
      method: "POST",
    });
    expect(joinEmailRes.status).toBe(200);
    expect(await joinEmailRes.json()).toEqual({
      joined: true,
      alreadyMember: false,
      communityId: uni!.id,
      communityName: "Universidad Nacional",
      verificationMethod: "email_domain",
      isTeam: false,
      message: "Pertenencia verificada.",
    });
  });

  it("refuses to send OTP or create membership when user email domain is not allowed and enforces OTP send rate limit", async () => {
    await testDb.delete(communityMember);
    await testDb.delete(user);

    const [uni] = await testDb
      .insert(community)
      .values({
        slug: "uni-nacional",
        name: "Universidad Nacional",
        kind: "university",
        destinationName: "Campus Central",
        destinationLat: -12.016,
        destinationLng: -77.05,
        allowedEmailDomains: ["uni.edu.pe"],
        isDemo: false,
      })
      .returning();

    const [personalUser] = await testDb
      .insert(user)
      .values({
        id: "u-personal",
        name: "Pedro",
        email: "pedro@gmail.com",
        emailVerified: true,
      })
      .returning();

    const sentEmails: unknown[] = [];
    let activeUser = personalUser!;
    let allowOtpSend = true;

    const app = createApp({
      db: testDb as never,
      getSession: async () => ({ user: activeUser }) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
      otpRateLimit: async () => ({
        success: allowOtpSend,
        reset: Date.now() + 60_000,
      }),
      sendEmail: async (options) => {
        sentEmails.push(options);
        return { success: true, data: { id: "email-1" } };
      },
    });

    // 1. Unallowed domain does not send OTP
    const blockedOtp = await app.request("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-community-id": uni!.id,
      },
      body: JSON.stringify({
        email: "pedro@gmail.com",
        type: "email-verification",
      }),
    });
    expect(blockedOtp.status).toBe(403);
    expect(await blockedOtp.json()).toEqual({
      success: false,
      status: 403,
      error:
        "Tu cuenta usa un correo que no pertenece a Universidad Nacional. Crea tu cuenta con tu correo institucional.",
      details: { code: "email_domain_not_allowed" },
    });
    expect(sentEmails).toHaveLength(0);

    // 2. Unallowed domain cannot create membership even if emailVerified = true
    const blockedVerify = await app.request(`/communities/${uni!.id}/verify-email`, {
      method: "POST",
    });
    expect(blockedVerify.status).toBe(403);
    expect(await blockedVerify.json()).toEqual({
      success: false,
      status: 403,
      error:
        "Tu cuenta usa un correo que no pertenece a Universidad Nacional. Crea tu cuenta con tu correo institucional.",
      details: { code: "email_domain_not_allowed" },
    });

    // 3. Rate limit on OTP sends
    const [instUser] = await testDb
      .insert(user)
      .values({
        id: "u-inst",
        name: "Lucía",
        email: "lucia@uni.edu.pe",
        emailVerified: false,
      })
      .returning();
    activeUser = instUser!;
    allowOtpSend = false;

    const rateLimitedOtp = await app.request("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-community-id": uni!.id,
      },
      body: JSON.stringify({
        email: "lucia@uni.edu.pe",
        type: "email-verification",
      }),
    });
    expect(rateLimitedOtp.status).toBe(429);
    expect(sentEmails).toHaveLength(0);
  });
});

describe("Onboarding consent, usual mode, and GET /me (US-011)", () => {
  it("exposes GET /me, saves server-timestamped consent and baseline usualMode via PATCH /communities/{id}/membership, and enforces requireOnboardedMember", async () => {
    await testDb.delete(communityMember);
    await testDb.delete(user);

    const [alfa] = await testDb
      .insert(community)
      .values({
        slug: "comunidad-alfa",
        name: "Comunidad Alfa",
        kind: "company",
        destinationName: "Centro Empresarial Real",
        destinationLat: -12.0975,
        destinationLng: -77.0356,
        joinCodeHash: "a713b09644f93d06ee6458195592400b1b76babb9beecae5064d9376dfdab704",
        isDemo: true,
      })
      .returning();

    const [sofia] = await testDb
      .insert(user)
      .values({
        id: "u-sofia",
        name: "Sofía Quispe",
        email: "sofia@alfa.pe",
        emailVerified: true,
      })
      .returning();

    const [membership] = await testDb
      .insert(communityMember)
      .values({
        communityId: alfa!.id,
        userId: sofia!.id,
        verificationMethod: "join_code",
        isTeam: false,
      })
      .returning();

    const fixedServerTime = new Date("2026-10-18T14:30:00.000Z");
    const app = createApp({
      db: testDb as never,
      getSession: async () => ({ user: sofia! }) as never,
      rateLimit: async () => ({ success: true, reset: 0 }),
      now: () => fixedServerTime,
    });

    // 1. GET /me returns incomplete membership (consentAt: null, usualMode: null)
    const meBeforeRes = await app.request("/me");
    expect(meBeforeRes.status).toBe(200);
    expect(await meBeforeRes.json()).toEqual({
      user: {
        id: "u-sofia",
        name: "Sofía Quispe",
        email: "sofia@alfa.pe",
      },
      memberships: [
        {
          id: membership!.id,
          communityId: alfa!.id,
          communityName: "Comunidad Alfa",
          destinationName: "Centro Empresarial Real",
          role: "member",
          verificationMethod: "join_code",
          consentVersion: null,
          consentAt: null,
          usualMode: null,
          travelRole: null,
          alias: null,
          identifiesAsWoman: false,
          womenOnly: false,
          isTeam: false,
        },
      ],
    });

    // 2. PATCH /communities/{id}/membership saves consentVersion='v1', server consentAt, usualMode, travelRole, alias
    const patchRes = await app.request(`/communities/${alfa!.id}/membership`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consentAccepted: true,
        consentAt: "1999-01-01T00:00:00.000Z", // must be ignored in favor of server clock
        usualMode: "drove_alone",
        travelRole: "both",
        alias: "Sofi",
      }),
    });

    expect(patchRes.status).toBe(200);
    expect(await patchRes.json()).toEqual({
      id: membership!.id,
      communityId: alfa!.id,
      communityName: "Comunidad Alfa",
      destinationName: "Centro Empresarial Real",
      role: "member",
      verificationMethod: "join_code",
      consentVersion: "v1",
      consentAt: "2026-10-18T14:30:00.000Z",
      usualMode: "drove_alone",
      travelRole: "both",
      alias: "Sofi",
      identifiesAsWoman: false,
      womenOnly: false,
      isTeam: false,
    });

    // 3. GET /me reflects saved onboarding fields
    const meAfterRes = await app.request("/me");
    expect(meAfterRes.status).toBe(200);
    const meAfterBody = (await meAfterRes.json()) as {
      memberships: Array<Record<string, unknown>>;
    };
    expect(meAfterBody.memberships[0]).toMatchObject({
      consentVersion: "v1",
      consentAt: "2026-10-18T14:30:00.000Z",
      usualMode: "drove_alone",
      travelRole: "both",
      alias: "Sofi",
    });
  });

  it("blocks protected routes with 403 onboarding_required when consent_at or usual_mode is missing", async () => {
    const { Hono } = await import("hono");
    const { requireOnboardedMember, requireSession } = await import("./middleware");
    const { errorHandler } = await import("./utils/error-handler");

    const testApp = new Hono();
    testApp.onError(errorHandler);
    testApp.use(
      "/trips",
      requireSession(async () => ({ user: { id: "u-incomplete" } }) as never),
    );
    testApp.use(
      "/trips",
      requireOnboardedMember("comm-1", async () => ({
        isMember: true,
        isOnboarded: false,
      })),
    );
    testApp.get("/trips", (c) => c.json({ ok: true }));

    const blockedRes = await testApp.request("/trips");
    expect(blockedRes.status).toBe(403);
    expect(await blockedRes.json()).toEqual({
      success: false,
      status: 403,
      error: "Completa tu registro antes de continuar.",
      details: { code: "onboarding_required" },
    });
  });
});

import { db as defaultDb } from "@andes-hack/db";
import * as schema from "@andes-hack/db/schema/auth";
import { env } from "@andes-hack/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";

export type VerificationOtpPayload = {
  email: string;
  otp: string;
  type: "sign-in" | "email-verification" | "forget-password" | "change-email";
};

export type VerificationOtpSender = (payload: VerificationOtpPayload) => Promise<void>;

let defaultOtpSender: VerificationOtpSender = async () => {};

export function setVerificationOtpSender(sender: VerificationOtpSender) {
  defaultOtpSender = sender;
}

export function createAuth(options?: {
  db?: typeof defaultDb;
  sendVerificationOTP?: VerificationOtpSender;
}) {
  const database = options?.db ?? defaultDb;
  const sendOtp = options?.sendVerificationOTP ?? ((payload) => defaultOtpSender(payload));

  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
    },
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        sendVerificationOTP: async ({ email, otp, type }) => {
          await sendOtp({ email, otp, type });
        },
      }),
    ],
  });
}

export const auth = createAuth();

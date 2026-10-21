import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    UPSTASH_REDIS_REST_URL: z.url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_BUCKET_NAME: z.string().min(1).optional(),
    // Voice search: Whisper turns the recording into text and a chat model fills the form.
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_PARSE_MODEL: z.string().min(1).default("gpt-4o-mini"),
    // Optional: remembers a person's usual search window in Atomic Memory when they ask to.
    // Checked by the server itself, so a bad value only turns this feature off.
    ATOMICMEMORY_API_URL: z.string().min(1).optional(),
    ATOMICMEMORY_API_KEY: z.string().min(1).optional(),
    CORS_ORIGIN: z.url(),
    TEAM_EMAILS: z.string().default(""),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

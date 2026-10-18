import { z } from "zod";

const seedEnv = z.object({
  DATABASE_URL: z.string().min(1),
  // US-009 asks for join codes of 8 characters or more.
  DEMO_JOIN_CODE: z.string().min(8),
  // The team account that becomes admin of the demo community; it signs up in the app first.
  DEMO_ADMIN_EMAIL: z.email(),
});

export function readSeedEnv(env: Record<string, string | undefined>) {
  const result = seedEnv.safeParse(env);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join("."));
    throw new Error(`Faltan o no son válidas estas variables de entorno: ${names.join(", ")}`);
  }
  return result.data;
}

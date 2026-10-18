import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";

import { runSmokeFlow } from "./smoke-flow";

loadEnv({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(`${name} must be configured in apps/server/.env or the process environment.`);
  return value;
}

try {
  await runSmokeFlow({
    baseUrl: requiredEnv("SMOKE_BASE_URL"),
    driverEmail: requiredEnv("SMOKE_DRIVER_EMAIL"),
    passengerEmail: requiredEnv("SMOKE_PASSENGER_EMAIL"),
    password: requiredEnv("SMOKE_PASSWORD"),
    joinCode: requiredEnv("DEMO_JOIN_CODE"),
    teamEmails: requiredEnv("TEAM_EMAILS"),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

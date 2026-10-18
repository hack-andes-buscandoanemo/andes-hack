import { describe, expect, it } from "vitest";

import { readSeedEnv } from "./env";

const complete = {
  DATABASE_URL: "postgresql://localhost:5432/te_jalo",
  DEMO_JOIN_CODE: "ALFA-DEMO-2026",
  DEMO_ADMIN_EMAIL: "equipo@te-jalo.example",
};

describe("reading the seed's environment", () => {
  it("names the demo join code when it is missing", () => {
    const { DEMO_JOIN_CODE: _missing, ...env } = complete;

    expect(() => readSeedEnv(env)).toThrow("DEMO_JOIN_CODE");
  });

  it("names every variable that is missing", () => {
    expect(() => readSeedEnv({})).toThrow("DATABASE_URL, DEMO_JOIN_CODE, DEMO_ADMIN_EMAIL");
  });

  it("refuses a join code shorter than 8 characters, naming it", () => {
    expect(() => readSeedEnv({ ...complete, DEMO_JOIN_CODE: "ALFA-26" })).toThrow("DEMO_JOIN_CODE");
  });

  it("accepts a join code of exactly 8 characters", () => {
    expect(readSeedEnv({ ...complete, DEMO_JOIN_CODE: "ALFA-202" }).DEMO_JOIN_CODE).toBe(
      "ALFA-202",
    );
  });

  it("refuses an admin email that is not an email, naming it", () => {
    expect(() => readSeedEnv({ ...complete, DEMO_ADMIN_EMAIL: "equipo" })).toThrow(
      "DEMO_ADMIN_EMAIL",
    );
  });

  it("keeps only the seed's variables from the environment", () => {
    expect(readSeedEnv({ ...complete, BETTER_AUTH_SECRET: "not-for-the-seed" })).toEqual({
      DATABASE_URL: "postgresql://localhost:5432/te_jalo",
      DEMO_JOIN_CODE: "ALFA-DEMO-2026",
      DEMO_ADMIN_EMAIL: "equipo@te-jalo.example",
    });
  });
});

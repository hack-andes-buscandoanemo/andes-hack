import alchemy from "alchemy";
import { Nextjs, Worker } from "alchemy/cloudflare";
import { config } from "dotenv";

config({ path: "./.env" });
config({ path: "../../apps/server/.env" });
config({ path: "../../apps/web/.env" });

const app = await alchemy("andes-hack");

export const server = await Worker("server", {
  cwd: "../../apps/server",
  entrypoint: "src/index.ts",
  url: true,
  compatibilityDate: "2025-04-01",
  compatibilityFlags: ["nodejs_compat"],
  bindings: {
    DATABASE_URL: alchemy.secret.env.DATABASE_URL!,
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: alchemy.env.BETTER_AUTH_URL!,
    UPSTASH_REDIS_REST_URL: alchemy.secret.env.UPSTASH_REDIS_REST_URL!,
    UPSTASH_REDIS_REST_TOKEN: alchemy.secret.env.UPSTASH_REDIS_REST_TOKEN!,
    CORS_ORIGIN: alchemy.env.CORS_ORIGIN!,
    NODE_ENV: "production",
  },
  dev: {
    port: 3000,
  },
});

export const web = await Nextjs("web", {
  cwd: "../../apps/web",
  url: true,
  bindings: {
    NEXT_PUBLIC_SERVER_URL: alchemy.env.NEXT_PUBLIC_SERVER_URL!,
    DATABASE_URL: alchemy.secret.env.DATABASE_URL!,
    CORS_ORIGIN: alchemy.env.CORS_ORIGIN!,
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: alchemy.env.BETTER_AUTH_URL!,
    API: server,
  },
  dev: {
    env: {
      PORT: "3001",
    },
  },
});

console.log(`Server -> ${server.url}`);
console.log(`Web    -> ${web.url}`);

await app.finalize();

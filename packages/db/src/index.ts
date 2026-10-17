import { env } from "@andes-hack/env/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema/index";

const sql = neon(env.DATABASE_URL);
export const db = drizzle(sql, { schema });

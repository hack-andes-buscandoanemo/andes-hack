import { env } from "@andes-hack/env/web";
import { headers } from "next/headers";
import { cache } from "react";

import { resolveAppAccess } from "@/lib/app-access";

// cache(): layout and page share one session + /me round trip per request.
export const getAccess = cache(async () =>
  resolveAppAccess({ headers: await headers(), serverUrl: env.NEXT_PUBLIC_SERVER_URL }),
);

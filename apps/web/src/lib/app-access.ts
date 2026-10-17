import { authClient } from "@/lib/auth-client";

type Membership = {
  communityName: string;
  consentAt: string | null;
  usualMode: string | null;
};

export type AppAccess =
  | { redirectTo: "/" | "/ingresar" | "/comenzar" }
  | { user: { name: string; email: string }; communityName?: string };

async function fetchMemberships(headers: Headers, serverUrl: string) {
  try {
    const res = await fetch(`${serverUrl}/me`, {
      headers: { cookie: headers.get("cookie") ?? "" },
    });
    if (res.status === 401) return "unauthenticated" as const;
    // ponytail: 404 = GET /me not deployed yet (US-011). 5xx/network also degrade to
    // session-only so the demo never crashes; remove once US-011 ships.
    if (!res.ok) return null;
    return ((await res.json()) as { memberships: Membership[] }).memberships;
  } catch {
    return null;
  }
}

export async function resolveAppAccess({
  headers,
  serverUrl,
}: {
  headers: Headers;
  serverUrl: string;
}): Promise<AppAccess> {
  const session = await authClient.getSession({ fetchOptions: { headers, throw: true } });
  if (!session?.user) return { redirectTo: "/" };
  const user = { name: session.user.name, email: session.user.email };

  const memberships = await fetchMemberships(headers, serverUrl);
  if (memberships === "unauthenticated") return { redirectTo: "/" };
  if (!memberships) return { user };

  const membership = memberships[0];
  if (!membership) return { redirectTo: "/ingresar" };
  if (!membership.consentAt || !membership.usualMode) return { redirectTo: "/comenzar" };
  return { user, communityName: membership.communityName };
}

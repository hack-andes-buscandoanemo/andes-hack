import { authClient } from "@/lib/auth-client";

type Membership = {
  communityId: string;
  communityName: string;
  role: "member" | "admin";
  consentAt: string | null;
  usualMode: string | null;
};

export type AppAccess =
  | { redirectTo: "/" | "/ingresar" | "/comenzar" }
  | { unavailable: true }
  | {
      user: { name: string; email: string };
      communityId?: string;
      communityName?: string;
      role?: "member" | "admin";
    };

async function fetchMemberships(headers: Headers, serverUrl: string) {
  try {
    const res = await fetch(`${serverUrl}/me`, {
      headers: { cookie: headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    if (res.status === 401) return "unauthenticated" as const;
    if (!res.ok) return "unavailable" as const;
    return ((await res.json()) as { memberships: Membership[] }).memberships;
  } catch {
    return "unavailable" as const;
  }
}

export async function resolveAppAccess({
  headers,
  serverUrl,
}: {
  headers: Headers;
  serverUrl: string;
}): Promise<AppAccess> {
  let session;
  try {
    session = await authClient.getSession({ fetchOptions: { headers, throw: true } });
  } catch {
    return { unavailable: true };
  }
  if (!session?.user) return { redirectTo: "/" };
  const user = { name: session.user.name, email: session.user.email };

  const memberships = await fetchMemberships(headers, serverUrl);
  if (memberships === "unauthenticated") return { redirectTo: "/" };
  if (memberships === "unavailable") return { unavailable: true };

  // ponytail: multi-membership selection is out of scope; first membership wins.
  const membership = memberships[0];
  if (!membership) return { redirectTo: "/ingresar" };
  if (!membership.consentAt || !membership.usualMode) return { redirectTo: "/comenzar" };
  return {
    user,
    communityId: membership.communityId,
    communityName: membership.communityName,
    role: membership.role,
  };
}

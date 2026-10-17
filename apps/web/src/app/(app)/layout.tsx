import { redirect } from "next/navigation";

import AccountUnavailable from "@/components/account-unavailable";
import AppShell from "@/components/app-shell";

import { getAccess } from "./access";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const access = await getAccess();
  if ("redirectTo" in access) redirect(access.redirectTo);

  if ("unavailable" in access) return <AccountUnavailable />;

  return <AppShell name={access.user.name}>{children}</AppShell>;
}

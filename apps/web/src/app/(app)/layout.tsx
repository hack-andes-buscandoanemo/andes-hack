import { redirect } from "next/navigation";

import AppShell from "@/components/app-shell";

import { getAccess } from "./access";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const access = await getAccess();
  if ("redirectTo" in access) redirect(access.redirectTo);

  return <AppShell name={access.user.name}>{children}</AppShell>;
}

import { redirect } from "next/navigation";

import AccountUnavailable from "@/components/account-unavailable";

import { getAccess } from "../../access";
import CommunityReports from "./community-reports";

export default async function CommunityReportsPage() {
  const access = await getAccess();
  if ("redirectTo" in access) redirect(access.redirectTo);
  if ("unavailable" in access) return <AccountUnavailable />;
  if (access.role !== "admin" || !access.communityId) redirect("/inicio");

  return (
    <main className="space-y-4 px-4 pt-2 pb-6">
      <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">
        Administrar comunidad
      </h1>
      <section aria-labelledby="community-reports-heading" className="space-y-4">
        <h2 id="community-reports-heading" className="text-lg font-semibold tracking-tight">
          Reportes
        </h2>
        <CommunityReports communityId={access.communityId} />
      </section>
    </main>
  );
}

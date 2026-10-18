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
    <main className="mx-auto w-full max-w-md space-y-4 px-4 py-6">
      <h1 className="text-2xl font-extrabold">Administrar comunidad</h1>
      <section aria-labelledby="community-reports-heading" className="space-y-4">
        <h2 id="community-reports-heading" className="text-lg font-bold">
          Reportes
        </h2>
        <CommunityReports communityId={access.communityId} />
      </section>
    </main>
  );
}

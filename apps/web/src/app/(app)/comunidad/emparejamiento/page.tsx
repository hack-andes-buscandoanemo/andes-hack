import { redirect } from "next/navigation";

import { getAccess } from "../../access";
import Emparejamiento from "./emparejamiento";

export default async function EmparejamientoPage() {
  const access = await getAccess();
  // Pages render in parallel with the layout, so guard here too.
  if ("redirectTo" in access) redirect(access.redirectTo);
  if ("unavailable" in access) return null; // layout shows the error state
  // Only administrators run the matching; the server refuses everyone else too.
  if (access.role !== "admin" || !access.communityId) redirect("/perfil");

  return <Emparejamiento communityId={access.communityId} />;
}

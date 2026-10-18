import { redirect } from "next/navigation";

import { getAccess } from "../access";
import Inicio from "./inicio";

export default async function InicioPage() {
  const access = await getAccess();
  // Pages render in parallel with the layout, so guard here too.
  if ("redirectTo" in access) redirect(access.redirectTo);
  if ("unavailable" in access) return null; // layout shows the error state

  return <Inicio name={access.user.name} communityId={access.communityId} />;
}

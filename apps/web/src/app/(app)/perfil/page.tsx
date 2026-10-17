import { redirect } from "next/navigation";

import { getAccess } from "../access";
import Perfil from "./perfil";

export default async function ProfilePage() {
  const access = await getAccess();
  // Pages render in parallel with the layout, so guard here too.
  if ("redirectTo" in access) redirect(access.redirectTo);
  if ("unavailable" in access) return null; // layout shows the error state

  return <Perfil name={access.user.name} email={access.user.email} />;
}

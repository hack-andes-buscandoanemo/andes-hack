import { getAccess } from "../access";
import Inicio from "./inicio";

export default async function InicioPage() {
  const access = await getAccess();
  if ("redirectTo" in access) return null; // layout already redirected

  return <Inicio name={access.user.name} communityName={access.communityName} />;
}

import { getAccess } from "../access";
import Perfil from "./perfil";

export default async function ProfilePage() {
  const access = await getAccess();
  if ("redirectTo" in access) return null; // layout already redirected

  return <Perfil name={access.user.name} email={access.user.email} />;
}

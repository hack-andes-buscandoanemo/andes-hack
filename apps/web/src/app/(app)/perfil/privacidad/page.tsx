import { redirect } from "next/navigation";

import { getAccess } from "../../access";
import PrivacySettings from "./privacy-settings";

export default async function PrivacyPage() {
  const access = await getAccess();
  if ("redirectTo" in access) redirect(access.redirectTo);
  if ("unavailable" in access) return null;

  return <PrivacySettings />;
}

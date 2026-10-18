import Link from "next/link";

import { BrandLockup } from "./brand-mark";

// Top bar of screens that live outside the signed-in shell (access, onboarding, public pages).
export default function StandaloneHeader() {
  return (
    <div className="flex items-center justify-between">
      <Link
        href="/"
        aria-label="Te Jalo, ir al inicio"
        className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        <BrandLockup />
      </Link>
    </div>
  );
}

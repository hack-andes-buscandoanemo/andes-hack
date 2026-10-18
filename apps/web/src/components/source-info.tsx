import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import type { components } from "@/lib/api-schema";

// The ⓘ next to an estimated figure: it opens the section of /datos (US-032) that says
// where the figure comes from.
export default function SourceInfo({
  topic,
}: {
  topic: components["schemas"]["DataSource"]["topic"];
}) {
  return (
    <Link
      href={`/datos#${topic}`}
      aria-label="De dónde sale esta cifra"
      className="ml-1 inline-flex align-middle text-muted-foreground"
    >
      <HugeiconsIcon icon={InformationCircleIcon} className="size-4" aria-hidden />
    </Link>
  );
}

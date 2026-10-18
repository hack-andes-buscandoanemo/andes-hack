import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

// Trailing affordance of a navigation row ("Historial de viajes ›").
export function RowChevron() {
  return (
    <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 text-muted-foreground" aria-hidden />
  );
}

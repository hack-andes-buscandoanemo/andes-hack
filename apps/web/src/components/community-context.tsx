import { UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

// Which community a search or an offer belongs to: trips are only shared inside it.
export default function CommunityContext({
  communityName,
  destinationName,
}: {
  communityName: string;
  destinationName: string;
}) {
  return (
    <p className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm shadow-xs">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-highlight text-highlight-foreground">
        <HugeiconsIcon icon={UserGroupIcon} className="size-[1.125rem]" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{communityName}</span>
        <span className="truncate text-[0.8125rem] text-muted-foreground">
          {`Sede: ${destinationName}`}
        </span>
      </span>
    </p>
  );
}

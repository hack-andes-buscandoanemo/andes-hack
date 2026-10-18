import { cn } from "@/lib/utils";

// The Te Jalo mark: two stops joined by one shared route, on signal yellow.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="9" className="fill-brand-yellow" />
      <path
        d="M9.5 22.5c0-4.6 3.4-6.5 6.5-6.5s6.5-1.9 6.5-6.5"
        fill="none"
        strokeWidth="2.6"
        strokeLinecap="round"
        className="stroke-brand-black"
      />
      <circle cx="9.5" cy="22.5" r="2.7" className="fill-brand-black" />
      <circle cx="22.5" cy="9.5" r="2.7" className="fill-brand-black" />
    </svg>
  );
}

export function BrandLockup({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark className={markClassName} />
      <span className="text-lg font-bold tracking-tight">Te Jalo</span>
    </span>
  );
}

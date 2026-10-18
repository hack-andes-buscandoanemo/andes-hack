import type { ReactNode } from "react";

// Title block every screen opens with, so headings share one size and rhythm.
export default function PageHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-[0.9375rem] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

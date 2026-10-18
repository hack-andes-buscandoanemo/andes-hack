export default function EmptyState({
  children,
  tone = "light",
}: {
  children: React.ReactNode;
  tone?: "light" | "dark";
}) {
  // "dark" is the emphasized variant: a warm highlight that invites the next step.
  const colors =
    tone === "dark"
      ? "border-transparent bg-highlight text-highlight-foreground"
      : "border-dashed bg-transparent text-muted-foreground";
  return <p className={`rounded-2xl border px-4 py-5 text-[0.9375rem] ${colors}`}>{children}</p>;
}

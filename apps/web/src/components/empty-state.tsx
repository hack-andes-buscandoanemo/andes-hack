export default function EmptyState({
  children,
  tone = "light",
}: {
  children: React.ReactNode;
  tone?: "light" | "dark";
}) {
  const colors =
    tone === "dark"
      ? "bg-brand-black text-white"
      : "border bg-card text-muted-foreground shadow-sm";
  return <p className={`rounded-2xl p-4 ${colors}`}>{children}</p>;
}

export default function SectionPage({ title, empty }: { title: string; empty: string }) {
  return (
    <main className="flex flex-col gap-4 px-4 py-4">
      <h1 className="text-3xl font-extrabold">{title}</h1>
      <p className="rounded-xl border bg-card p-4 text-muted-foreground">{empty}</p>
    </main>
  );
}

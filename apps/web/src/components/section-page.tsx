import EmptyState from "@/components/empty-state";

export default function SectionPage({ title, empty }: { title: string; empty: string }) {
  return (
    <main className="flex flex-col gap-4 px-4 py-4">
      <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{title}</h1>
      <EmptyState>{empty}</EmptyState>
    </main>
  );
}

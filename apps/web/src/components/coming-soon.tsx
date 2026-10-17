import Link from "next/link";

export default function ComingSoon({ title }: { title: string }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-10 text-center">
      <h1 className="text-3xl font-extrabold">{title}</h1>
      <p className="text-muted-foreground">Próximamente.</p>
      <Link href="/" className="font-medium underline">
        Volver al inicio
      </Link>
    </main>
  );
}

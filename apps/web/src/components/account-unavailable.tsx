import Link from "next/link";

export default function AccountUnavailable() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p role="alert" className="text-lg font-bold">
        No pudimos cargar tu cuenta. Inténtalo de nuevo en unos minutos.
      </p>
      <Link
        href="/inicio"
        className="flex min-h-12 items-center justify-center rounded-full bg-brand-yellow px-6 font-bold text-brand-black"
      >
        Reintentar
      </Link>
    </main>
  );
}

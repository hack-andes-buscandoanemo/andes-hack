import Link from "next/link";

import { buttonVariants } from "./ui/button";

export default function AccountUnavailable() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p role="alert" className="text-lg font-semibold text-balance">
        No pudimos cargar tu cuenta. Inténtalo de nuevo en unos minutos.
      </p>
      <Link href="/inicio" className={buttonVariants({ size: "lg" })}>
        Reintentar
      </Link>
    </main>
  );
}

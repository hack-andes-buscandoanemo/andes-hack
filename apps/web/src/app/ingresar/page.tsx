import Link from "next/link";

// ponytail: stub until US-009 builds the real entity entry flow.
export default function EnterPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-10">
      <h1 className="text-center text-3xl font-extrabold">Ingresar con mi entidad</h1>
      <Link
        href="/crear-cuenta"
        className="flex min-h-12 items-center justify-center rounded-full bg-brand-yellow px-5 font-bold text-brand-black"
      >
        Crear cuenta
      </Link>
      <Link href="/iniciar-sesion" className="text-center font-medium underline">
        Ya tengo una cuenta
      </Link>
    </main>
  );
}

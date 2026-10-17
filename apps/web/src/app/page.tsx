"use client";

import {
  ArrowRight01Icon,
  BankIcon,
  Coins01Icon,
  Leaf01Icon,
  Location01Icon,
  UserGroupIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";

const BENEFITS = [
  {
    icon: UserGroupIcon,
    title: "Comunidades verificadas",
    body: "Solo miembros de entidades aliadas.",
  },
  {
    icon: Location01Icon,
    title: "Rutas compatibles",
    body: "Te conectamos con personas que hacen rutas similares.",
  },
  {
    icon: Coins01Icon,
    title: "Gastos compartidos",
    body: "Estimamos el aporte de combustible de cada tramo. La app no cobra.",
  },
  {
    icon: Leaf01Icon,
    title: "Movilidad sostenible",
    body: "Menos autos con un solo ocupante en tu comunidad.",
  },
];

const FOOTER_LINKS = [
  { href: "/panel", label: "Impacto en vivo" },
  { href: "/datos", label: "Datos y supuestos" },
  { href: "/instituciones", label: "¿Tu institución quiere sumarse?" },
] as const;

export default function Home() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  // ponytail: the (app) layout routes to /ingresar or /comenzar when /me says so (US-011).
  useEffect(() => {
    if (session) router.replace("/inicio");
  }, [session, router]);

  if (isPending || session) return null;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-4 py-6 md:max-w-xl">
      <header className="text-center">
        <h1 className="text-5xl font-extrabold tracking-tight">Te Jalo</h1>
        <p className="mt-2 text-lg font-bold">Compartimos rutas, movemos Lima</p>
        <p className="text-sm text-muted-foreground">
          Movilidad compartida entre comunidades verificadas
        </p>
      </header>

      <Image
        src="/hero-carpool.jpg"
        alt="Cuatro personas de una misma comunidad compartiendo un auto"
        width={758}
        height={342}
        priority
        className="w-full rounded-2xl object-cover"
      />

      <ul className="grid grid-cols-2 gap-3">
        {BENEFITS.map(({ icon, title, body }) => (
          <li key={title} className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm">
            <span className="flex size-10 items-center justify-center rounded-full bg-brand-yellow text-brand-black">
              <HugeiconsIcon icon={icon} className="size-5" aria-hidden />
            </span>
            <h2 className="text-base leading-tight font-bold">{title}</h2>
            <p className="text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>

      <nav aria-label="Acceso" className="flex flex-col gap-3">
        <Link
          href="/ingresar"
          className="flex min-h-12 items-center justify-center gap-3 rounded-full bg-brand-yellow px-5 text-base font-bold text-brand-black"
        >
          <HugeiconsIcon icon={BankIcon} className="size-5" aria-hidden />
          Ingresar con mi entidad
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-5" aria-hidden />
        </Link>
        <Link
          href="/crear-cuenta"
          className="flex min-h-12 items-center justify-center gap-3 rounded-full border-2 border-foreground px-5 text-base font-bold"
        >
          <HugeiconsIcon icon={UserIcon} className="size-5" aria-hidden />
          Crear cuenta
        </Link>
        <Link href="/iniciar-sesion" className="text-center font-medium underline">
          Ya tengo una cuenta
        </Link>
      </nav>

      <footer className="mt-auto flex flex-col items-center gap-2 text-center text-sm">
        <p className="text-muted-foreground">Conectamos personas que ya recorren rutas similares</p>
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          {FOOTER_LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link href={href} className="underline">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </footer>
    </main>
  );
}

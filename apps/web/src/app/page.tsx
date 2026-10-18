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

import { BrandMark } from "@/components/brand-mark";
import { buttonVariants } from "@/components/ui/button";
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
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-10 px-4 pt-5 pb-8 md:max-w-3xl md:px-6 lg:grid lg:max-w-7xl lg:grid-cols-2 lg:items-center lg:gap-x-14 lg:gap-y-12 lg:px-10 lg:pt-8">
      <header className="flex flex-col gap-8 lg:col-start-1 lg:row-start-1">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <h1 className="text-lg font-bold tracking-tight">Te Jalo</h1>
        </div>
        <div className="space-y-3">
          <p className="text-[2.5rem] leading-[1.05] font-bold tracking-[-0.03em] text-balance md:text-5xl">
            Compartimos rutas, movemos Lima
          </p>
          <p className="max-w-[34ch] text-[1.0625rem] text-muted-foreground">
            Movilidad compartida entre comunidades verificadas
          </p>
        </div>
      </header>

      <nav aria-label="Acceso" className="flex flex-col gap-3 lg:col-start-1 lg:row-start-2">
        <Link href="/ingresar" className={buttonVariants({ size: "lg" })}>
          <HugeiconsIcon icon={BankIcon} className="size-5" aria-hidden />
          Ingresar con mi entidad
          <HugeiconsIcon icon={ArrowRight01Icon} className="ml-auto size-5" aria-hidden />
        </Link>
        <Link href="/crear-cuenta" className={buttonVariants({ size: "lg", variant: "outline" })}>
          <HugeiconsIcon icon={UserIcon} className="size-5" aria-hidden />
          Crear cuenta
          <span aria-hidden className="ml-auto size-5" />
        </Link>
        <Link
          href="/iniciar-sesion"
          className="inline-flex min-h-11 items-center justify-center text-sm font-semibold underline-offset-4 hover:underline"
        >
          Ya tengo una cuenta
        </Link>
      </nav>

      <Image
        src="/hero-carpool.jpg"
        alt="Cuatro personas de una misma comunidad compartiendo un auto"
        width={758}
        height={342}
        priority
        className="aspect-[758/342] w-full rounded-3xl object-cover shadow-md lg:col-start-2 lg:row-span-2 lg:row-start-1"
      />

      <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-4">
        {BENEFITS.map(({ icon, title, body }) => (
          <li key={title} className="flex gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-highlight text-highlight-foreground">
              <HugeiconsIcon icon={icon} className="size-5" aria-hidden />
            </span>
            <div className="space-y-1 pt-0.5">
              <h2 className="text-base leading-snug font-semibold tracking-tight">{title}</h2>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          </li>
        ))}
      </ul>

      <footer className="mt-auto flex flex-col items-center gap-3 border-t pt-6 text-center text-sm lg:col-span-2">
        <p className="text-muted-foreground">Conectamos personas que ya recorren rutas similares</p>
        <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1">
          {FOOTER_LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className="inline-flex min-h-11 items-center font-medium underline underline-offset-4 decoration-border hover:decoration-foreground"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </footer>
    </main>
  );
}

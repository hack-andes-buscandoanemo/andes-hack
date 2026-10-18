"use client";

import {
  Car01Icon,
  Home01Icon,
  Message01Icon,
  Notification01Icon,
  Search01Icon,
  Shield01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

import LiveAlerts from "@/components/live-alerts";

import { BrandLockup } from "./brand-mark";

const SECTIONS = [
  { href: "/inicio", label: "Inicio", icon: Home01Icon },
  { href: "/buscar", label: "Buscar", icon: Search01Icon },
  { href: "/viajes", label: "Viajes", icon: Car01Icon },
  { href: "/chat", label: "Chat", icon: Message01Icon },
  { href: "/perfil", label: "Perfil", icon: UserIcon },
] as const;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export default function AppShell({
  name,
  isAdmin,
  children,
}: {
  name: string;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const sections = isAdmin
    ? [
        ...SECTIONS,
        {
          href: "/comunidad/reportes",
          label: "Administrar comunidad",
          icon: Shield01Icon,
        } as const,
      ]
    : SECTIONS;

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col md:max-w-xl">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-background/85 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <Link
          href="/inicio"
          className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <BrandLockup />
        </Link>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled
            aria-label="Avisos (próximamente)"
            className="flex size-11 items-center justify-center rounded-full text-muted-foreground disabled:opacity-60"
          >
            <HugeiconsIcon icon={Notification01Icon} className="size-[1.375rem]" aria-hidden />
          </button>
          <span
            role="img"
            aria-label={`Perfil de ${name}`}
            className="flex size-10 items-center justify-center rounded-full bg-brand-yellow text-sm font-bold text-brand-black ring-2 ring-background"
          >
            {initials(name)}
          </span>
        </div>
      </header>

      <LiveAlerts />

      <div className="flex-1 pb-28">{children}</div>

      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md supports-[backdrop-filter]:bg-background/75"
      >
        <ul className="mx-auto flex max-w-md px-1 md:max-w-xl">
          {sections.map(({ href, label, icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            const short = href === "/comunidad/reportes" ? "Comunidad" : label;
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href as Route}
                  aria-current={active ? "page" : undefined}
                  aria-label={short === label ? undefined : label}
                  className={`group flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-[0.6875rem] tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ring ${
                    active
                      ? "font-semibold text-foreground"
                      : "font-medium text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span
                    className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200 ease-out ${active ? "bg-brand-yellow text-brand-black" : "group-hover:bg-muted"}`}
                  >
                    <HugeiconsIcon
                      icon={icon}
                      className="size-5"
                      strokeWidth={active ? 2 : 1.6}
                      aria-hidden
                    />
                  </span>
                  {short}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

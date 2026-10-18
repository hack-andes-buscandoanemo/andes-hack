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
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col md:max-w-3xl lg:max-w-7xl lg:flex-row">
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md supports-[backdrop-filter]:bg-background/75 lg:sticky lg:inset-x-auto lg:top-0 lg:bottom-auto lg:h-svh lg:w-60 lg:shrink-0 lg:border-r lg:border-t-0 lg:bg-background lg:px-3 lg:py-6 lg:backdrop-blur-none"
      >
        <ul className="mx-auto flex w-full max-w-md px-1 md:max-w-3xl lg:mt-10 lg:max-w-none lg:flex-col lg:gap-1 lg:px-0">
          {sections.map(({ href, label, icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            const short = href === "/comunidad/reportes" ? "Comunidad" : label;
            return (
              <li key={href} className="min-w-0 flex-1 lg:flex-none">
                <Link
                  href={href as Route}
                  aria-current={active ? "page" : undefined}
                  aria-label={short === label ? undefined : label}
                  className={`group flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-center text-[0.625rem] leading-tight tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ring lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-left lg:text-sm ${
                    active
                      ? "bg-muted font-semibold text-foreground"
                      : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span
                    className={`flex h-8 w-11 items-center justify-center rounded-full transition-colors duration-200 ease-out sm:w-14 lg:size-9 lg:shrink-0 ${active ? "bg-brand-yellow text-brand-black" : "group-hover:bg-background"}`}
                  >
                    <HugeiconsIcon
                      icon={icon}
                      className="size-5"
                      strokeWidth={active ? 2 : 1.6}
                      aria-hidden
                    />
                  </span>
                  {short === label ? label : <span className="lg:hidden">{short}</span>}
                  {short !== label ? <span className="hidden lg:inline">{label}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0 flex-1">
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

        <div className="pb-28 lg:pb-10">{children}</div>
      </div>
    </div>
  );
}

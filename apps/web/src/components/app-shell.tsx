"use client";

import {
  Car01Icon,
  Home01Icon,
  Message01Icon,
  Notification01Icon,
  Search01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

export default function AppShell({ name, children }: { name: string; children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col md:max-w-xl">
      <header className="flex items-center justify-between px-4 py-3">
        <span className="text-2xl font-extrabold tracking-tight">Te Jalo</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Avisos"
            className="flex size-11 items-center justify-center rounded-full"
          >
            <HugeiconsIcon icon={Notification01Icon} className="size-6" aria-hidden />
          </button>
          <span
            role="img"
            aria-label={`Perfil de ${name}`}
            className="flex size-11 items-center justify-center rounded-full bg-brand-yellow font-bold text-brand-black"
          >
            {initials(name)}
          </span>
        </div>
      </header>

      <div className="flex-1 pb-20">{children}</div>

      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-10 border-t bg-background pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-md md:max-w-xl">
          {SECTIONS.map(({ href, label, icon }) => {
            const active = pathname === href;
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px] ${
                    active ? "font-bold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <span
                    className={`flex h-7 w-12 items-center justify-center rounded-full ${active ? "bg-brand-yellow text-brand-black" : ""}`}
                  >
                    <HugeiconsIcon icon={icon} className="size-5" aria-hidden />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

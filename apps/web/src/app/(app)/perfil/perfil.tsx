"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

import TravelPreferences, { type TravelPreferencesProps } from "./travel-preferences";

export default function Perfil({
  name,
  email,
  role = "member",
  preferences,
}: {
  name: string;
  email: string;
  role?: "member" | "admin";
  preferences?: TravelPreferencesProps;
}) {
  const router = useRouter();

  return (
    <main className="flex flex-col gap-4 px-4 py-4">
      <h1 className="text-3xl font-extrabold">Perfil</h1>
      <div className="rounded-xl border bg-card p-4">
        <p className="font-bold">{name}</p>
        <p className="text-muted-foreground">{email}</p>
      </div>
      <Link
        href={{ pathname: "/viajes", query: { tab: "historial" } }}
        className="rounded-xl border bg-card p-4 font-bold"
      >
        Historial de viajes
      </Link>
      {preferences ? <TravelPreferences {...preferences} /> : null}
      {role === "admin" ? (
        <section
          aria-labelledby="admin-community"
          className="flex flex-col gap-2 rounded-xl border bg-card p-4"
        >
          <h2 id="admin-community" className="font-bold">
            Administrar comunidad
          </h2>
          <Link
            href="/comunidad/emparejamiento"
            className="flex min-h-11 items-center justify-between rounded-lg bg-muted px-3 font-medium"
          >
            Emparejamiento
            <span aria-hidden>›</span>
          </Link>
        </section>
      ) : null}
      <Button
        variant="outline"
        className="min-h-12"
        onClick={async () => {
          await authClient.signOut();
          router.push("/");
        }}
      >
        Cerrar sesión
      </Button>
    </main>
  );
}

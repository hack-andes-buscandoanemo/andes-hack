"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export default function Perfil({ name, email }: { name: string; email: string }) {
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

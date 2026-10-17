"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export default function Dashboard({ name }: { name: string }) {
  const router = useRouter();

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="text-3xl font-extrabold">Inicio</h1>
      <p>Hola, {name}</p>
      <Button
        variant="outline"
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

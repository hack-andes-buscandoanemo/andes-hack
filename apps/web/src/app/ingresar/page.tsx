"use client";

import { JoinCommunityBodySchema } from "@andes-hack/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { communitiesApi, type CommunitySummary } from "@/lib/communities-api";

const KIND_LABELS: Record<CommunitySummary["kind"], string> = {
  company: "Empresa",
  university: "Universidad",
  public_entity: "Entidad pública",
  event: "Evento",
};

export default function EnterPage() {
  const router = useRouter();
  const [communities, setCommunities] = useState<CommunitySummary[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    communitiesApi
      .listCommunities()
      .then((items) => {
        if (!active) return;
        setCommunities(items);
        if (items[0]) setSelectedId(items[0].id);
      })
      .catch(() => {
        if (!active) return;
        setCommunities([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = communities.filter((item) =>
    item.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const selectedCommunity =
    communities.find((item) => item.id === selectedId) ?? filtered[0] ?? null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedCommunity) return;

    const parsed = JoinCommunityBodySchema.safeParse({ code });
    if (!parsed.success) {
      setErrorMessage("El código no es válido para esta comunidad.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await communitiesApi.joinCommunity(selectedCommunity.id, parsed.data.code);
      if (!result.alreadyMember) {
        setSuccessMessage(result.message);
      }
      router.push("/comenzar");
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 429) {
        setErrorMessage("Demasiados intentos. Espera unos minutos.");
      } else {
        setErrorMessage("El código no es válido para esta comunidad.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-10">
      <h1 className="text-center text-3xl font-extrabold">Ingresar con mi entidad</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="community-search">Elige tu comunidad</Label>
          <Input
            id="community-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar entidad o comunidad..."
          />
          <ul className="flex flex-col gap-2">
            {filtered.map((item) => {
              const isSelected = selectedCommunity?.id === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    aria-pressed={isSelected}
                    className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                      isSelected ? "border-foreground bg-brand-yellow/20" : "bg-card"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="font-bold">{item.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {KIND_LABELS[item.kind]}
                      </span>
                    </div>
                    {item.isDemo && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                        Datos sintéticos
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="join-code">Código de acceso</Label>
          <Input
            id="join-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
          />
        </div>

        {errorMessage && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {errorMessage}
          </p>
        )}

        {successMessage && (
          <p role="status" className="text-sm font-medium text-foreground">
            {successMessage}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Validando código…" : "Unirme"}
        </Button>
      </form>

      <div className="flex flex-col gap-2 pt-2">
        <Link
          href="/crear-cuenta"
          className="flex min-h-12 items-center justify-center rounded-full bg-brand-yellow px-5 font-bold text-brand-black"
        >
          Crear cuenta
        </Link>
        <Link href="/iniciar-sesion" className="text-center font-medium underline">
          Ya tengo una cuenta
        </Link>
      </div>
    </main>
  );
}

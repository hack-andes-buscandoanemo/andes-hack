"use client";

import { JoinCommunityBodySchema } from "@andes-hack/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import StandaloneHeader from "@/components/standalone-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { communitiesApi, type CommunitySummary } from "@/lib/communities-api";

const KIND_LABELS: Record<CommunitySummary["kind"], string> = {
  company: "Empresa",
  university: "Universidad",
  public_entity: "Entidad pública",
  event: "Evento",
};

type VerificationMode = "join_code" | "email_domain";

export default function EnterPage() {
  const router = useRouter();
  const { data: sessionData } = authClient.useSession();
  const userEmail = sessionData?.user?.email ?? "";

  const [communities, setCommunities] = useState<CommunitySummary[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [mode, setMode] = useState<VerificationMode>("join_code");
  const [code, setCode] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
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

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const filtered = communities.filter((item) =>
    item.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const selectedCommunity =
    communities.find((item) => item.id === selectedId) ?? filtered[0] ?? null;

  function handleSelectCommunity(id: string) {
    setSelectedId(id);
    setMode("join_code");
    setOtpSent(false);
    setOtp("");
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  async function handleSendOtp() {
    if (!selectedCommunity || !userEmail) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await communitiesApi.sendEmailOtp(selectedCommunity.id, userEmail);
      setOtpSent(true);
      setResendCooldown(60);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 429) {
        setErrorMessage("Demasiados intentos. Espera unos minutos.");
      } else {
        setErrorMessage(
          `Tu cuenta usa un correo que no pertenece a ${selectedCommunity.name}. Crea tu cuenta con tu correo institucional.`,
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedCommunity || !userEmail) return;
    if (!/^\d{6}$/.test(otp.trim())) {
      setErrorMessage("El código no es válido o ya venció.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await communitiesApi.verifyEmailOtp(userEmail, otp.trim());
      const result = await communitiesApi.confirmEmailMembership(selectedCommunity.id);
      setSuccessMessage(result.message);
      router.push("/comenzar");
    } catch {
      setErrorMessage("El código no es válido o ya venció.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmitJoinCode(e: React.FormEvent<HTMLFormElement>) {
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
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-5 pb-10">
      <StandaloneHeader />
      <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">
        Ingresar con mi entidad
      </h1>

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
                  onClick={() => handleSelectCommunity(item.id)}
                  aria-pressed={isSelected}
                  className="choice-surface flex min-h-14 w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold">{item.name}</span>
                    <span className="text-xs text-muted-foreground">{KIND_LABELS[item.kind]}</span>
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

      {selectedCommunity?.hasEmailVerification && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "join_code" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setMode("join_code");
              setErrorMessage(null);
            }}
          >
            Código de acceso
          </Button>
          <Button
            type="button"
            variant={mode === "email_domain" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setMode("email_domain");
              setErrorMessage(null);
            }}
          >
            Verificar con correo institucional
          </Button>
        </div>
      )}

      {mode === "email_domain" && selectedCommunity ? (
        !selectedCommunity.matchedEmailDomain ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {`Tu cuenta usa un correo que no pertenece a ${selectedCommunity.name}. Crea tu cuenta con tu correo institucional.`}
          </p>
        ) : (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4" noValidate>
            <p className="text-sm text-muted-foreground">
              {`Usa tu correo de ${selectedCommunity.name} (${selectedCommunity.matchedEmailDomain})`}
            </p>

            {!otpSent ? (
              <Button
                type="button"
                size="lg"
                className="w-full"
                onClick={handleSendOtp}
                disabled={isSubmitting}
              >
                Enviar código
              </Button>
            ) : (
              <>
                <p role="status" className="text-sm font-medium text-foreground">
                  {`Te enviamos un código a ${userEmail}. Vence en 5 minutos.`}
                </p>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="otp-code">Código de 6 dígitos</Label>
                  <Input
                    id="otp-code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                  />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                  Verificar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSendOtp}
                  disabled={resendCooldown > 0 || isSubmitting}
                >
                  Reenviar código
                </Button>
              </>
            )}

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
          </form>
        )
      ) : (
        <form onSubmit={handleSubmitJoinCode} className="flex flex-col gap-4" noValidate>
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
      )}

      <div className="flex flex-col gap-2 border-t pt-6">
        <Link href="/crear-cuenta" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Crear cuenta
        </Link>
        <Link
          href="/iniciar-sesion"
          className="inline-flex min-h-11 items-center justify-center text-sm font-semibold underline-offset-4 hover:underline"
        >
          Ya tengo una cuenta
        </Link>
      </div>
    </main>
  );
}

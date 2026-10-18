"use client";

import { TravelRoleSchema, UpdateMembershipBodySchema } from "@andes-hack/api";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type z from "zod";

import StandaloneHeader from "@/components/standalone-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { communitiesApi, type MembershipSummary } from "@/lib/communities-api";
import { USUAL_MODE_OPTIONS, type UsualMode } from "@/lib/usual-modes";

type TravelRole = z.infer<typeof TravelRoleSchema>;

const TRAVEL_ROLE_OPTIONS: Array<{ value: TravelRole; label: string }> = [
  { value: "driver", label: "Tengo vehículo y puedo llevar gente" },
  { value: "passenger", label: "Busco con quién ir" },
  { value: "both", label: "Ambos, según el día" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [membership, setMembership] = useState<MembershipSummary | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [usualModeError, setUsualModeError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      consentAccepted: false,
      usualMode: "" as UsualMode | "",
      travelRole: "both" as TravelRole,
      alias: "",
    },
    onSubmit: async ({ value }) => {
      if (!membership) return;
      setConsentError(null);
      setUsualModeError(null);
      setSubmitError(null);

      let hasError = false;
      if (!value.consentAccepted) {
        setConsentError("Debes aceptar las condiciones para continuar.");
        hasError = true;
      }
      if (!value.usualMode) {
        setUsualModeError("Elige cómo viajaste la última vez.");
        hasError = true;
      }
      if (hasError) return;

      const parsed = UpdateMembershipBodySchema.safeParse({
        consentAccepted: value.consentAccepted,
        usualMode: value.usualMode,
        travelRole: value.travelRole,
        alias: value.alias.trim() || undefined,
      });

      if (!parsed.success) {
        setSubmitError(parsed.error.issues[0]?.message ?? "Revisa tus datos.");
        return;
      }

      try {
        await communitiesApi.updateMembership(membership.communityId, parsed.data);
        router.push("/inicio");
      } catch {
        setSubmitError("No pudimos guardar tus datos. Inténtalo de nuevo.");
      }
    },
  });

  useEffect(() => {
    let active = true;
    communitiesApi
      .getMe()
      .then((me) => {
        if (!active) return;
        const firstMembership = me.memberships[0];
        if (!firstMembership) {
          router.replace("/ingresar");
          return;
        }
        if (firstMembership.consentAt && firstMembership.usualMode) {
          router.replace("/inicio");
          return;
        }
        setMembership(firstMembership);
        const firstName = me.user.name.trim().split(/\s+/)[0] ?? "";
        form.setFieldValue("alias", firstMembership.alias ?? firstName);
      })
      .catch(() => {
        if (!active) return;
        router.replace("/");
      });
    return () => {
      active = false;
    };
  }, [form, router]);

  if (!membership) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-10 text-center">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Antes de empezar</h1>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-5 pb-10">
      <StandaloneHeader />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="flex flex-col gap-6"
      >
        <section className="flex flex-col gap-3">
          <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">
            Antes de empezar
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Te Jalo es una herramienta comunitaria para coordinar viajes compartidos al mismo
            destino entre personas de tu entidad. No somos una empresa de transporte ni
            intermediamos pagos. Cada persona decide con quién viajar y cómo dividir los gastos
            reales del viaje.
          </p>

          <form.Field name="consentAccepted">
            {(field) => (
              <div className="flex flex-col gap-1">
                <div className="flex items-start gap-2.5 pt-1">
                  <input
                    id="consent-checkbox"
                    type="checkbox"
                    checked={field.state.value}
                    onChange={(e) => {
                      field.handleChange(e.target.checked);
                      if (e.target.checked) setConsentError(null);
                    }}
                    className="mt-1 size-4 accent-foreground"
                  />
                  <Label htmlFor="consent-checkbox" className="leading-snug font-medium">
                    Tengo 18 años o más y acepto estas condiciones
                  </Label>
                </div>
                {consentError && (
                  <p role="alert" className="text-sm font-medium text-destructive">
                    {consentError}
                  </p>
                )}
              </div>
            )}
          </form.Field>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">¿Cómo viajaste la última vez?</h2>
          <p className="text-sm text-muted-foreground">
            {`El último día que fuiste a ${membership.destinationName}, ¿cómo fuiste?`}
          </p>

          <form.Field name="usualMode">
            {(field) => (
              <div className="flex flex-col gap-2">
                {USUAL_MODE_OPTIONS.map((option) => {
                  const selected = field.state.value === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        field.handleChange(option.value);
                        setUsualModeError(null);
                      }}
                      className={`min-h-14 rounded-xl border px-4 py-3 text-left text-sm font-medium shadow-xs transition-colors ${
                        selected ? "border-foreground bg-highlight font-semibold" : "bg-card"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
                {usualModeError && (
                  <p role="alert" className="text-sm font-medium text-destructive">
                    {usualModeError}
                  </p>
                )}
              </div>
            )}
          </form.Field>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">¿Cómo quieres participar?</h2>

          <form.Field name="travelRole">
            {(field) => (
              <div className="flex flex-col gap-2">
                {TRAVEL_ROLE_OPTIONS.map((option) => {
                  const selected = field.state.value === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => field.handleChange(option.value)}
                      className={`min-h-14 rounded-xl border px-4 py-3 text-left text-sm font-medium shadow-xs transition-colors ${
                        selected ? "border-foreground bg-highlight font-semibold" : "bg-card"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}
          </form.Field>
        </section>

        <form.Field name="alias">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor="visible-alias">Nombre visible</Label>
              <Input
                id="visible-alias"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                maxLength={30}
              />
            </div>
          )}
        </form.Field>

        {submitError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {submitError}
          </p>
        )}

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              Guardar y empezar
            </Button>
          )}
        </form.Subscribe>
      </form>
    </main>
  );
}

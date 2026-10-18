"use client";

import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import z from "zod";

import AuthField from "@/components/auth-field";
import { Button } from "@/components/ui/button";
import { httpClient } from "@/lib/http-client";

import ConsentField from "./consent-field";
import { failureMessage } from "./failure-message";
import TrapField from "./trap-field";

const schema = z.object({
  institution: z.string().trim().min(1, "Escribe el nombre de tu institución."),
  role: z.string().trim().min(1, "Escribe tu rol."),
  onSiteCount: z
    .string()
    .regex(/^[1-9]\d*$/, "Escribe cuántas personas van a la sede.")
    // The same ceiling as POST /public/waitlist, so the server never has to refuse it.
    .refine((count) => Number(count) <= 100_000, "Escribe un número de hasta 100 000 personas."),
  wantsPilot: z.enum(["yes", "no"], "Elige Sí o No."),
  email: z.email("Escribe un correo válido."),
  consent: z.literal(true, "Acepta el uso de tus datos para continuar."),
  website: z.string(),
});

// The institutional waitlist: someone with a role at an institution asks for a pilot.
export default function PilotForm() {
  const [notice, setNotice] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      institution: "",
      role: "",
      onSiteCount: "",
      wantsPilot: "" as "" | "yes" | "no",
      email: "",
      consent: false,
      website: "",
    },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      try {
        const response = await httpClient.post("/public/waitlist", {
          kind: "institution",
          institution: value.institution,
          role: value.role,
          onSiteCount: Number(value.onSiteCount),
          wantsPilot: value.wantsPilot === "yes",
          email: value.email,
          consent: true,
          website: value.website,
        });
        setNotice(response.data.message);
      } catch (error) {
        setNotice(failureMessage(error));
      }
    },
  });

  return (
    <form
      noValidate
      aria-labelledby="pilot-heading"
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="space-y-4"
    >
      <h2 id="pilot-heading" className="text-lg font-semibold tracking-tight">
        Pide un piloto de 4 semanas
      </h2>
      <form.Field name="institution">
        {(field) => (
          <AuthField
            name="pilot-institution"
            label="Institución"
            autoComplete="organization"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <form.Field name="role">
        {(field) => (
          <AuthField
            name="pilot-role"
            label="Tu rol"
            autoComplete="organization-title"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <form.Field name="onSiteCount">
        {(field) => (
          <AuthField
            name="pilot-on-site-count"
            label="Personas que van presencialmente a la sede"
            type="number"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <form.Field name="wantsPilot">
        {(field) => (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">¿Les interesa un piloto de 4 semanas?</legend>
            <div className="flex gap-6">
              {(
                [
                  ["yes", "Sí"],
                  ["no", "No"],
                ] as const
              ).map(([answer, label]) => (
                <label key={answer} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="pilot-wants-pilot"
                    value={answer}
                    checked={field.state.value === answer}
                    onChange={() => field.handleChange(answer)}
                  />
                  {label}
                </label>
              ))}
            </div>
            {field.state.meta.errors.map((error) =>
              error ? (
                <p key={error.message} className="text-sm font-medium text-destructive">
                  {error.message}
                </p>
              ) : null,
            )}
          </fieldset>
        )}
      </form.Field>
      <form.Field name="email">
        {(field) => (
          <AuthField
            name="pilot-email"
            label="Correo de contacto"
            type="email"
            autoComplete="email"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <form.Field name="consent">
        {(field) => (
          <ConsentField
            name="pilot-consent"
            label="Acepto que Te Jalo use estos datos solo para coordinar el piloto."
            checked={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="website">
        {(field) => (
          <TrapField id="pilot-website" value={field.state.value} onChange={field.handleChange} />
        )}
      </form.Field>
      {notice && (
        <p role="status" className="text-sm font-medium">
          {notice}
        </p>
      )}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
            Enviar
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

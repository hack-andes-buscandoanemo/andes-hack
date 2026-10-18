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
  email: z.email("Escribe un correo válido."),
  institution: z.string().trim().min(1, "Escribe el nombre de tu institución."),
  consent: z.literal(true, "Acepta el uso de tus datos para continuar."),
  website: z.string(),
});

// The individual waitlist: a person asks to be told when their institution joins.
export default function NotifyForm() {
  const [notice, setNotice] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "", institution: "", consent: false, website: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      try {
        const response = await httpClient.post("/public/waitlist", {
          kind: "individual",
          institution: value.institution,
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
      aria-labelledby="notify-heading"
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="space-y-4"
    >
      <h2 id="notify-heading" className="text-xl font-bold">
        Avísame cuando mi empresa esté
      </h2>
      <form.Field name="email">
        {(field) => (
          <AuthField
            name="notify-email"
            label="Correo"
            type="email"
            autoComplete="email"
            value={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <form.Field name="institution">
        {(field) => (
          <AuthField
            name="notify-institution"
            label="Institución"
            autoComplete="organization"
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
            name="notify-consent"
            label="Acepto que Te Jalo use mi correo solo para avisarme cuando mi institución esté."
            checked={field.state.value}
            errors={field.state.meta.errors}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="website">
        {(field) => (
          <TrapField id="notify-website" value={field.state.value} onChange={field.handleChange} />
        )}
      </form.Field>
      {notice && (
        <p role="status" className="text-sm font-medium">
          {notice}
        </p>
      )}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button
            type="submit"
            variant="outline"
            className="w-full"
            size="lg"
            disabled={isSubmitting}
          >
            Avísame
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

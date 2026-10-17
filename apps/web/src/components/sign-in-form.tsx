"use client";

import { useForm } from "@tanstack/react-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import AuthField from "./auth-field";
import { Button } from "./ui/button";

const schema = z.object({
  email: z.email("Escribe un correo válido."),
  password: z.string().min(1, "Escribe tu contraseña."),
});

export default function SignInForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      await authClient.signIn.email(value, {
        // ponytail: US-011 will route to onboarding when the profile is incomplete.
        onSuccess: () => router.push("/dashboard"),
        onError: () => setFormError("Correo o contraseña incorrectos."),
      });
    },
  });

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="mb-6 text-center text-3xl font-extrabold">Iniciar sesión</h1>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <form.Field name="email">
          {(field) => (
            <AuthField
              name="email"
              label="Correo electrónico"
              type="email"
              autoComplete="email"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field name="password">
          {(field) => (
            <AuthField
              name="password"
              label="Contraseña"
              type="password"
              autoComplete="current-password"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        {formError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        )}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "Iniciando sesión..." : "Iniciar sesión"}
            </Button>
          )}
        </form.Subscribe>
      </form>
      <p className="mt-4 text-center">
        <Link href="/crear-cuenta" className="font-medium underline">
          Crear cuenta
        </Link>
      </p>
    </div>
  );
}

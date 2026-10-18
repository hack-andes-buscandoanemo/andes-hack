"use client";

import { useForm } from "@tanstack/react-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import AuthField from "./auth-field";
import StandaloneHeader from "./standalone-header";
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
        onSuccess: () => router.push("/inicio"),
        onError: ({ error }) =>
          setFormError(
            error.status === 401 || error.code === "INVALID_EMAIL_OR_PASSWORD"
              ? "Correo o contraseña incorrectos."
              : "No pudimos iniciar sesión. Inténtalo de nuevo.",
          ),
      });
    },
  });

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-8 px-4 pt-5 pb-10">
      <StandaloneHeader />
      <div className="surface p-6">
        <h1 className="mb-6 text-2xl leading-tight font-bold tracking-tight">Iniciar sesión</h1>
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
      </div>
      <p className="text-center text-sm">
        <Link href="/crear-cuenta" className="font-medium underline">
          Crear cuenta
        </Link>
      </p>
    </div>
  );
}

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
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres."),
  email: z.email("Escribe un correo válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
});

export default function SignUpForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      await authClient.signUp.email(value, {
        // ponytail: US-011 will route to community selection instead of Inicio.
        onSuccess: () => router.push("/inicio"),
        onError: ({ error }) =>
          setFormError(
            error.code?.startsWith("USER_ALREADY_EXISTS")
              ? "Ya existe una cuenta con este correo. Inicia sesión."
              : "No pudimos crear tu cuenta. Revisa tus datos e inténtalo de nuevo.",
          ),
      });
    },
  });

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="mb-6 text-center text-3xl font-extrabold">Crear cuenta</h1>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <form.Field name="name">
          {(field) => (
            <AuthField
              name="name"
              label="Nombre"
              autoComplete="name"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
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
              autoComplete="new-password"
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
              {isSubmitting ? "Creando cuenta..." : "Crear cuenta"}
            </Button>
          )}
        </form.Subscribe>
      </form>
      <p className="mt-4 text-center">
        <Link href="/iniciar-sesion" className="font-medium underline">
          Ya tengo una cuenta
        </Link>
      </p>
    </div>
  );
}

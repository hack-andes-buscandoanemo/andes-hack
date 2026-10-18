"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { communitiesApi } from "@/lib/communities-api";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "long",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

export default function PrivacySettings() {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletedAt, setDeletedAt] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function deleteData() {
    setDeleting(true);
    setError(false);
    try {
      const result = await communitiesApi.deleteMe();
      setDeletedAt(result.deletedAt);
      setConfirming(false);
    } catch {
      setError(true);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <h1 className="text-3xl font-extrabold">Privacidad</h1>
      {deletedAt ? (
        <section className="space-y-2 rounded-xl border bg-card p-4">
          <p role="status" className="font-bold">
            Tus datos fueron eliminados.
          </p>
          <p>Fecha de borrado de los datos: {formatDate(deletedAt)}</p>
        </section>
      ) : (
        <>
          <section className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="text-xl font-bold">Qué guardamos y por qué</h2>
            <p>Tu zona se guarda por distrito, nunca tu dirección.</p>
            <p>Los puntos de encuentro son lugares públicos.</p>
            <p>Tu institución solo ve estadísticas de grupos de 10 personas o más.</p>
            <p>Fecha de borrado de los datos: inmediatamente al confirmar.</p>
          </section>
          <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
            Eliminar mis datos
          </Button>
          {error ? <p role="alert">No pudimos eliminar tus datos. Inténtalo de nuevo.</p> : null}
          {confirming ? (
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-title"
              className="space-y-3 rounded-xl border p-4"
            >
              <h2 id="delete-title" className="text-xl font-bold">
                Eliminar mis datos
              </h2>
              <p>Esta acción no se puede deshacer.</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={deleting} onClick={() => void deleteData()}>
                  {deleting ? "Eliminando…" : "Confirmar eliminación"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={deleting}
                  onClick={() => setConfirming(false)}
                >
                  Cancelar
                </Button>
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}

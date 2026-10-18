"use client";

import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { communitiesApi } from "@/lib/communities-api";
import { USUAL_MODE_OPTIONS, type UsualMode } from "@/lib/usual-modes";

export type EditableProfile = { alias: string | null; usualMode: string | null };

export default function EditProfile({
  communityId,
  initial,
  onSaved,
}: {
  communityId: string;
  initial: EditableProfile;
  onSaved: (profile: EditableProfile) => void;
}) {
  const [alias, setAlias] = useState(initial.alias ?? "");
  const [usualMode, setUsualMode] = useState(initial.usualMode ?? "other");
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    // No consent in the body: the server keeps the one given at onboarding.
    const payload = { alias: alias.trim() || undefined, usualMode: usualMode as UsualMode };
    try {
      await communitiesApi.updateMembership(communityId, payload);
    } catch {
      setMessage("No pudimos guardar tus cambios. Inténtalo de nuevo.");
      return;
    }
    onSaved({ alias: payload.alias ?? null, usualMode: payload.usualMode });
    setMessage("Cambios guardados.");
  }

  return (
    <section
      aria-labelledby="edit-profile"
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
    >
      <h2 id="edit-profile" className="font-bold">
        Editar perfil
      </h2>
      <form onSubmit={(event) => void save(event)} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="profile-alias">Nombre visible</Label>
          <Input
            id="profile-alias"
            value={alias}
            maxLength={30}
            onChange={(event) => setAlias(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="profile-usual-mode">Modo habitual</Label>
          <select
            id="profile-usual-mode"
            value={usualMode}
            onChange={(event) => setUsualMode(event.target.value)}
            className="min-h-11 rounded-md border bg-background px-3"
          >
            {USUAL_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" className="min-h-12">
          Guardar cambios
        </Button>
        {message ? <p role="status">{message}</p> : null}
      </form>
    </section>
  );
}

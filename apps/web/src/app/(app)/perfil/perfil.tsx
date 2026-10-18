"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import ProfileAvatar from "@/components/profile-avatar";
import { Button } from "@/components/ui/button";
import type { ProfileMembership } from "@/lib/app-access";
import { authClient } from "@/lib/auth-client";
import { communitiesApi } from "@/lib/communities-api";

import EditProfile, { type EditableProfile } from "./edit-profile";
import HelpCenter from "./help-center";
import MyImpact from "./my-impact";
import TravelPreferences, { type TravelPreferencesProps } from "./travel-preferences";

const invalidPhotoMessage = "Usa una imagen JPG, PNG o WebP de hasta 2 MB.";
const uploadErrorMessage = "No pudimos subir tu foto. Inténtalo de nuevo.";

const VERIFICATION_LABELS: Record<ProfileMembership["verificationMethod"], string> = {
  join_code: "Código de acceso",
  email_domain: "Correo institucional",
};

// The validated membership always counts; the rest is what the person can still fill in. The
// vehicle only counts for someone who drives.
function completeness(membership: ProfileMembership, hasVehicle: boolean) {
  const items = [true, Boolean(membership.alias), Boolean(membership.usualMode)];
  if (membership.travelRole === "driver" || membership.travelRole === "both") {
    items.push(hasVehicle);
  }
  return Math.round((items.filter(Boolean).length / items.length) * 100);
}

export default function Perfil({
  name,
  email,
  role = "member",
  preferences,
  membership: initialMembership,
}: {
  name: string;
  email: string;
  role?: "member" | "admin";
  preferences?: TravelPreferencesProps;
  membership?: ProfileMembership;
}) {
  const router = useRouter();
  const photoInput = useRef<HTMLInputElement>(null);
  const photoChanged = useRef(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [hasVehicle, setHasVehicle] = useState(false);
  // The header and the completeness follow what "Editar perfil" saves.
  const [membership, setMembership] = useState(initialMembership);
  const displayName = membership?.alias ?? name;

  useEffect(() => {
    let active = true;
    communitiesApi
      .getMyProfilePhoto()
      .then(({ photoUrl: result }) => {
        if (active && !photoChanged.current) setPhotoUrl(result);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // Without the answer the row stays hidden; nothing else on the profile depends on it.
    void communitiesApi
      .listVehicles()
      .then((vehicles) => setHasVehicle(vehicles.length > 0))
      .catch(() => {});
  }, []);

  async function uploadPhoto(file: File) {
    setPhotoError("");
    if (
      file.size < 1 ||
      file.size > 2 * 1024 * 1024 ||
      (file.type !== "image/jpeg" && file.type !== "image/png" && file.type !== "image/webp")
    ) {
      setPhotoError(invalidPhotoMessage);
      return;
    }

    setUploading(true);
    try {
      const staged = await communitiesApi.uploadProfilePhoto({
        contentType: file.type,
        size: file.size,
      });
      const uploaded = await fetch(staged.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploaded.ok) throw new Error("Photo upload failed");
      const confirmed = await communitiesApi.confirmProfilePhoto(staged.key);
      photoChanged.current = true;
      setPhotoUrl(confirmed.photoUrl);
    } catch (cause) {
      const message = (cause as { response?: { data?: { error?: unknown } } }).response?.data
        ?.error;
      setPhotoError(message === invalidPhotoMessage ? invalidPhotoMessage : uploadErrorMessage);
    } finally {
      setUploading(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  async function removePhoto() {
    setRemoving(true);
    setPhotoError("");
    try {
      await communitiesApi.deleteMyProfilePhoto();
      photoChanged.current = true;
      setPhotoUrl(null);
    } catch {
      setPhotoError("No pudimos quitar tu foto. Inténtalo de nuevo.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <main className="flex flex-col gap-4 px-4 py-4">
      <h1 className="text-3xl font-extrabold">Perfil</h1>
      <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
        <ProfileAvatar name={displayName} photoUrl={photoUrl} className="size-14" />
        <div className="flex min-w-0 flex-col">
          <p className="font-bold">{displayName}</p>
          {membership ? <p>{membership.communityName}</p> : null}
          <p className="truncate text-muted-foreground">{email}</p>
          {membership ? (
            <>
              <p className="text-sm font-medium">
                {`Miembro verificado · ${VERIFICATION_LABELS[membership.verificationMethod]}`}
              </p>
              <p className="text-sm text-muted-foreground">
                {`Perfil completo ${completeness(membership, hasVehicle)} %`}
              </p>
            </>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Tu foto solo la ven los miembros de tu comunidad.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={photoInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Cambiar foto"
          className="sr-only"
          disabled={uploading || removing}
          onChange={(event) => {
            const [file] = event.currentTarget.files ?? [];
            if (file) void uploadPhoto(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="min-h-12"
          disabled={uploading || removing}
          onClick={() => photoInput.current?.click()}
        >
          {uploading ? "Subiendo foto…" : "Cambiar foto"}
        </Button>
        {photoUrl ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-12"
            disabled={uploading || removing}
            onClick={removePhoto}
          >
            {removing ? "Quitando foto…" : "Quitar foto"}
          </Button>
        ) : null}
      </div>
      {photoError ? <p role="alert">{photoError}</p> : null}
      <section
        aria-labelledby="security"
        className="flex flex-col gap-2 rounded-xl border bg-card p-4"
      >
        <h2 id="security" className="font-bold">
          Seguridad
        </h2>
        <p>Pertenencia validada</p>
        {/* Declared, not verified: neither the SOAT nor the property card is checked yet. */}
        {hasVehicle ? <p>Vehículo registrado: Declarado</p> : null}
        <Link
          href={{ pathname: "/viajes", query: { tab: "historial" } }}
          className="flex min-h-11 items-center justify-between rounded-lg bg-muted px-3 font-medium"
        >
          Historial de viajes
          <span aria-hidden>›</span>
        </Link>
        <HelpCenter />
      </section>
      {preferences ? <TravelPreferences {...preferences} /> : null}
      {membership ? <MyImpact communityId={membership.communityId} /> : null}
      {membership ? (
        <EditProfile
          communityId={membership.communityId}
          initial={membership}
          onSaved={(saved: EditableProfile) => setMembership({ ...membership, ...saved })}
        />
      ) : null}
      <Link className="min-h-12 rounded-xl border p-4 font-bold" href="/perfil/privacidad">
        Privacidad
      </Link>
      {role === "admin" ? (
        <section
          aria-labelledby="admin-community"
          className="flex flex-col gap-2 rounded-xl border bg-card p-4"
        >
          <h2 id="admin-community" className="font-bold">
            Administrar comunidad
          </h2>
          <Link
            href="/comunidad/emparejamiento"
            className="flex min-h-11 items-center justify-between rounded-lg bg-muted px-3 font-medium"
          >
            Emparejamiento
            <span aria-hidden>›</span>
          </Link>
        </section>
      ) : null}
      <Button
        variant="outline"
        className="min-h-12"
        onClick={async () => {
          await authClient.signOut();
          router.push("/");
        }}
      >
        Cerrar sesión
      </Button>
    </main>
  );
}

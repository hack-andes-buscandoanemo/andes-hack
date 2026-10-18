"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import ProfileAvatar from "@/components/profile-avatar";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { communitiesApi } from "@/lib/communities-api";

const invalidPhotoMessage = "Usa una imagen JPG, PNG o WebP de hasta 2 MB.";
const uploadErrorMessage = "No pudimos subir tu foto. Inténtalo de nuevo.";

import TravelPreferences, { type TravelPreferencesProps } from "./travel-preferences";

export default function Perfil({
  name,
  email,
  role = "member",
  preferences,
}: {
  name: string;
  email: string;
  role?: "member" | "admin";
  preferences?: TravelPreferencesProps;
}) {
  const router = useRouter();
  const photoInput = useRef<HTMLInputElement>(null);
  const photoChanged = useRef(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [photoError, setPhotoError] = useState("");

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
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <ProfileAvatar name={name} photoUrl={photoUrl} className="size-14" />
        <div className="min-w-0">
          <p className="font-bold">{name}</p>
          <p className="text-muted-foreground">{email}</p>
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
      <Link
        href={{ pathname: "/viajes", query: { tab: "historial" } }}
        className="rounded-xl border bg-card p-4 font-bold"
      >
        Historial de viajes
      </Link>
      {preferences ? <TravelPreferences {...preferences} /> : null}
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
      <Link className="min-h-12 rounded-xl border p-4 font-bold" href="/perfil/privacidad">
        Privacidad
      </Link>
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

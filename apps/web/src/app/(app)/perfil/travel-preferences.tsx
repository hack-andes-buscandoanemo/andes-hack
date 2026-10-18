"use client";

import Link from "next/link";
import { useState } from "react";

import { RowChevron } from "@/components/row-chevron";
import { reasonOf } from "@/lib/api-error";
import { communitiesApi, type TravelPreferences as Preferences } from "@/lib/communities-api";

export type TravelPreferencesProps = Preferences & { communityId: string };

export default function TravelPreferences({ communityId, ...initial }: TravelPreferencesProps) {
  const [preferences, setPreferences] = useState<Preferences>(initial);
  const [message, setMessage] = useState<string | null>(null);

  async function save(next: Preferences) {
    if (next.womenOnly && !next.identifiesAsWoman) {
      setMessage('Para usar "Solo mujeres", confirma que te identificas como mujer.');
      return;
    }
    try {
      const saved = await communitiesApi.updateTravelPreferences(communityId, next);
      setPreferences({ identifiesAsWoman: saved.identifiesAsWoman, womenOnly: saved.womenOnly });
      setMessage(saved.message);
    } catch (failure: unknown) {
      setMessage(reasonOf(failure, "No pudimos guardar tu preferencia. Inténtalo de nuevo."));
    }
  }

  return (
    <section aria-labelledby="travel-preferences" className="flex flex-col gap-3 surface p-5">
      <h2 id="travel-preferences" className="text-base font-semibold tracking-tight">
        Preferencias de viaje
      </h2>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <label htmlFor="women-only" className="font-medium">
            Solo mujeres
          </label>
          <span id="women-only-note" className="text-sm text-muted-foreground">
            Preferencia opcional
          </span>
        </div>
        <input
          id="women-only"
          type="checkbox"
          role="switch"
          aria-describedby="women-only-note"
          className="size-5 accent-foreground"
          checked={preferences.womenOnly}
          onChange={(event) => void save({ ...preferences, womenOnly: event.target.checked })}
        />
      </div>
      <div className="flex items-start gap-2">
        <input
          id="identifies-as-woman"
          type="checkbox"
          aria-describedby="identifies-as-woman-note"
          className="mt-1 size-4 accent-foreground"
          checked={preferences.identifiesAsWoman}
          // Without the declaration "Solo mujeres" cannot stay on.
          onChange={(event) =>
            void save({
              identifiesAsWoman: event.target.checked,
              womenOnly: event.target.checked && preferences.womenOnly,
            })
          }
        />
        <div className="flex flex-col">
          <label htmlFor="identifies-as-woman">Me identifico como mujer</label>
          <span id="identifies-as-woman-note" className="text-sm text-muted-foreground">
            Solo se usa para emparejarte; nadie más la ve
          </span>
        </div>
      </div>
      {message ? <p role="status">{message}</p> : null}
      {/* Upcoming trips list the person's saved offers and seat requests. */}
      <Link
        href="/viajes"
        className="flex min-h-12 items-center justify-between rounded-xl bg-muted px-4 text-[0.9375rem] font-medium transition-colors hover:bg-secondary"
      >
        Rutas recurrentes
        <RowChevron />
      </Link>
    </section>
  );
}

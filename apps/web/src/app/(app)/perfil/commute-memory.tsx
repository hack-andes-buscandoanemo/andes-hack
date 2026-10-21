"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { reasonOf } from "@/lib/api-error";
import { communitiesApi, type CommuteWindow } from "@/lib/communities-api";

import { clockLabel } from "../buscar/schedule";

// The search window the person asked to remember in Buscar viaje, kept in Atomic Memory. Shown
// only when the server has it set up; forgetting it removes it from Atomic Memory.
export default function CommuteMemory() {
  const [enabled, setEnabled] = useState(false);
  const [remembered, setRemembered] = useState<CommuteWindow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [forgetting, setForgetting] = useState(false);

  useEffect(() => {
    let active = true;
    communitiesApi
      .getCommuteMemory()
      .then((memory) => {
        if (!active) return;
        setEnabled(memory.enabled);
        setRemembered(memory.window);
      })
      .catch((failure: unknown) => {
        const reason = reasonOf(failure, "");
        if (!active || !reason) return;
        setEnabled(true);
        setMessage(reason);
      });
    return () => {
      active = false;
    };
  }, []);

  async function forget() {
    setForgetting(true);
    try {
      const done = await communitiesApi.forgetCommute();
      setRemembered(null);
      setMessage(done.message);
    } catch (failure: unknown) {
      setMessage(reasonOf(failure, "No se borró tu horario. Inténtalo de nuevo."));
    } finally {
      setForgetting(false);
    }
  }

  if (!enabled) return null;

  return (
    <section aria-labelledby="commute-memory" className="flex flex-col gap-2 surface p-5">
      <h2 id="commute-memory" className="text-base font-semibold tracking-tight">
        Horario recordado
      </h2>
      {remembered ? (
        <>
          <p className="text-lg font-semibold tabular-nums">
            {clockLabel(remembered.windowStart)} a {clockLabel(remembered.windowEnd)}
          </p>
          <p className="text-sm text-muted-foreground">
            Llena el horario de{" "}
            <Link href="/buscar" className="underline underline-offset-2">
              Buscar viaje
            </Link>
            . Para cambiarlo, elige otro allí y pide que lo recordemos. Se guarda en Atomic Memory
            solo para tu cuenta.
          </p>
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={forgetting}
            onClick={() => void forget()}
          >
            Olvidar horario
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No recordamos ningún horario. Puedes pedirlo en{" "}
          <Link href="/buscar" className="underline underline-offset-2">
            Buscar viaje
          </Link>
          .
        </p>
      )}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

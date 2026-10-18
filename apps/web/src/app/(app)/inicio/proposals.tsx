"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { FUEL_NOTE, FuelShareLine } from "@/components/fuel-estimate";
import { Button } from "@/components/ui/button";
import { reasonOf } from "@/lib/api-error";
import { communitiesApi, type MatchProposal } from "@/lib/communities-api";

import { clockLabel, dateLabel } from "../buscar/schedule";

// The seats the matching recommended to this person (US-019). Nothing is booked until
// they ask for the seat, and the driver still decides.
export default function Proposals({ communityId }: { communityId: string }) {
  const [proposals, setProposals] = useState<MatchProposal[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    communitiesApi
      .listProposals(communityId)
      .then((list) => {
        if (active) setProposals(list);
      })
      .catch(() => {
        // Inicio shows no proposal rather than an error: the person can still search.
      });
    return () => {
      active = false;
    };
  }, [communityId]);

  async function requestSeat(proposal: MatchProposal) {
    if (sending) return;
    setSending(proposal.suggestionId);
    setErrors((current) => ({ ...current, [proposal.suggestionId]: "" }));
    try {
      await communitiesApi.requestSeat(proposal.offerId);
      setSent((current) => new Set(current).add(proposal.suggestionId));
    } catch (failure) {
      setErrors((current) => ({
        ...current,
        [proposal.suggestionId]: reasonOf(
          failure,
          "No pudimos enviar tu solicitud. Inténtalo de nuevo.",
        ),
      }));
    } finally {
      setSending(null);
    }
  }

  if (proposals.length === 0) return null;

  return (
    <section aria-label="Propuestas para ti" className="flex flex-col gap-2">
      {proposals.map((proposal) => (
        <article
          key={proposal.suggestionId}
          className="flex flex-col gap-1 rounded-2xl border-2 border-brand-yellow bg-card p-4 text-sm shadow-sm"
        >
          <p className="font-bold">{`Tenemos una propuesta para ti: viaje de ${proposal.driverName}`}</p>
          <p className="text-muted-foreground">
            {`${proposal.direction === "outbound" ? "Ida" : "Regreso"} · ${dateLabel(proposal.date)}`}
          </p>
          <p>{`${proposal.meetingPointName} · Recogida ${clockLabel(proposal.pickupAt)}`}</p>
          <FuelShareLine estimate={proposal.fuelEstimate} />
          {errors[proposal.suggestionId] ? (
            <p role="alert" className="font-medium text-destructive">
              {errors[proposal.suggestionId]}
            </p>
          ) : null}
          {sent.has(proposal.suggestionId) ? (
            <p role="status" className="font-medium">
              {`Solicitud enviada. Te avisaremos cuando ${proposal.driverName} responda.`}
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Link
                href={`/viajes/${proposal.offerId}`}
                className="flex min-h-11 items-center justify-center rounded-full border font-bold"
              >
                Ver detalle
              </Link>
              <Button
                type="button"
                disabled={sending === proposal.suggestionId}
                className="min-h-11 rounded-full font-bold"
                onClick={() => void requestSeat(proposal)}
              >
                Solicitar asiento
              </Button>
            </div>
          )}
        </article>
      ))}
      <p className="text-xs text-muted-foreground">{FUEL_NOTE}</p>
    </section>
  );
}

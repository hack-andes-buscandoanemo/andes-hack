"use client";

import { useEffect, useState } from "react";

import SectionPage from "@/components/section-page";
import { Button } from "@/components/ui/button";
import { communitiesApi, type TripOfferSummary } from "@/lib/communities-api";

export default function TripsPage() {
  const [offers, setOffers] = useState<TripOfferSummary[]>([]);

  useEffect(() => {
    let active = true;
    communitiesApi
      ?.getMe?.()
      .then(async (me) => {
        if (!active || !me?.memberships?.[0]) return;
        const list = await communitiesApi.listCommunityOffers(me.memberships[0].communityId);
        if (!active) return;
        setOffers(list ?? []);
      })
      .catch(() => {
        if (!active) return;
        setOffers([]);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleToggleStatus(offer: TripOfferSummary) {
    const nextStatus = offer.status === "paused" ? "active" : "paused";
    const updated = await communitiesApi.updateOfferStatus(offer.id, nextStatus);
    setOffers((prev) =>
      prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
    );
  }

  if (offers.length === 0) {
    return (
      <SectionPage
        title="Viajes"
        empty="Aún no tienes viajes. Busca uno o publica el que ya haces."
      />
    );
  }

  return (
    <section className="mx-auto w-full max-w-md space-y-4 px-4 py-6">
      <h1 className="text-2xl font-extrabold">Viajes</h1>
      <ul className="space-y-3">
        {offers.map((offer) => {
          const freeSeats = offer.seatsTotal - offer.seatsTaken;
          const isPaused = offer.status === "paused";
          return (
            <li
              key={offer.id}
              className="flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">
                  {offer.originZoneName ?? offer.originZoneId} · {offer.departureTime.slice(0, 5)}
                </span>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                  {isPaused ? "Pausado" : "Activo"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {`${freeSeats} de ${offer.seatsTotal} asientos libres`}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleToggleStatus(offer)}
              >
                {isPaused ? "Reactivar viaje" : "Pausar viaje"}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

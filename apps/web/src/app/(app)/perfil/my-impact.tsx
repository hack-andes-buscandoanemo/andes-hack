"use client";

import { useEffect, useState } from "react";

import { communitiesApi, type MyImpact as Impact } from "@/lib/communities-api";
import { kg } from "@/lib/format";

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-lg font-bold">{value}</span>
    </div>
  );
}

export default function MyImpact({ communityId }: { communityId: string }) {
  const [impact, setImpact] = useState<Impact | null>(null);

  useEffect(() => {
    void communitiesApi.getMyImpact(communityId).then(setImpact);
  }, [communityId]);

  return (
    <section
      aria-labelledby="my-impact"
      className="flex flex-col gap-2 rounded-xl border bg-card p-4"
    >
      <h2 id="my-impact" className="font-bold">
        Mi impacto
      </h2>
      {impact ? (
        <>
          <Figure label="Viajes compartidos" value={String(impact.sharedTrips)} />
          <Figure label="Viajes en auto evitados" value={String(impact.carTripsAvoided)} />
          <Figure label="CO₂ evitado (estimado)" value={kg(impact.co2Kg)} />
          {impact.fromPublicTransport > 0 ? (
            <p className="text-sm text-muted-foreground">
              Mejoraste tu viaje; no cuenta como auto evitado
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

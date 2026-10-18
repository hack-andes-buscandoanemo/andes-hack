"use client";

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { communitiesApi, type LiveAlert } from "@/lib/communities-api";
import type { Coordinates } from "@/lib/geo";

import { LiveBadge, TripPrice } from "./trip-price";
import { buttonVariants } from "./ui/button";
import { clockLabel } from "@/app/(app)/buscar/schedule";

const POLL_EVERY_MS = 6_000;
const SHOWN_AT_ONCE = 2;

// The device's position, only when the person already allowed it: the alert never asks for
// permission by itself. Without it the alerts are the community's, not the nearby ones.
async function knownLocation(): Promise<Coordinates | undefined> {
  if (!("geolocation" in navigator) || !navigator.permissions) return undefined;
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    if (status.state !== "granted") return undefined;
    return await new Promise<Coordinates | undefined>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
        () => resolve(undefined),
        { maximumAge: 60_000, timeout: 8_000 },
      );
    });
  } catch {
    return undefined;
  }
}

// Shows, on any screen, the trips whose driver has just turned Te Jalo on, so a passenger
// does not have to search: the full route opens from the alert.
export default function LiveAlerts() {
  const pathname = usePathname();
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    let location: Coordinates | undefined;

    async function poll(communityId: string) {
      if (document.visibilityState === "hidden") return;
      try {
        const list = await communitiesApi.listLiveAlerts(communityId, location);
        if (alive) setAlerts(list);
      } catch {
        // No alert is better than an error banner on every screen.
      }
    }

    async function start() {
      try {
        const me = await communitiesApi.getMe();
        // Someone who joined only to drive is not waiting for a ride.
        const membership = me.memberships.find((item) => item.travelRole !== "driver");
        if (!alive || !membership) return;
        location = await knownLocation();
        if (!alive) return;
        void poll(membership.communityId);
        timer = setInterval(() => void poll(membership.communityId), POLL_EVERY_MS);
      } catch {
        // Not signed in or the account did not load: the screens say so themselves.
      }
    }
    void start();
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  const visible = alerts
    .filter((alert) => !dismissed.has(alert.offerId) && !pathname.endsWith(alert.offerId))
    .slice(0, SHOWN_AT_ONCE);
  if (visible.length === 0) return null;

  return (
    <div aria-live="polite" className="sticky top-[4.25rem] z-10 flex flex-col gap-2 px-4 pb-2">
      {visible.map((alert) => {
        const outbound = alert.direction === "outbound";
        const route = outbound
          ? `${alert.originZoneName} → ${alert.destinationName}`
          : `${alert.destinationName} → ${alert.originZoneName}`;
        return (
          <section
            key={alert.offerId}
            role="status"
            className="space-y-2 rounded-2xl border bg-card p-5 text-sm shadow-md ring-2 ring-brand-yellow"
          >
            <div className="flex items-center justify-between gap-2">
              <LiveBadge />
              <button
                type="button"
                aria-label="Cerrar alerta"
                className="-mr-1.5 flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => setDismissed((current) => new Set(current).add(alert.offerId))}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-4" aria-hidden />
              </button>
            </div>
            <p className="text-[0.9375rem] font-semibold">{`${alert.driverName} va ${route}`}</p>
            <p className="text-muted-foreground tabular-nums">
              {`Sale a las ${clockLabel(alert.departureTime.slice(0, 5))}`}
              {alert.distanceKm !== null ? ` · a ${alert.distanceKm} km de ti` : ""}
              {` · ${alert.seatsFree === 1 ? "1 asiento" : `${alert.seatsFree} asientos`}`}
            </p>
            <TripPrice priceCents={alert.priceCents} paymentMethods={alert.paymentMethods} />
            <Link
              href={`/viajes/${alert.offerId}` as Route}
              className={buttonVariants({ className: "w-full" })}
            >
              Ver ruta completa
            </Link>
          </section>
        );
      })}
    </div>
  );
}

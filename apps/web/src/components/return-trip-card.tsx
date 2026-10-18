"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { dateLabel, daysLabel } from "@/app/(app)/buscar/schedule";
import { Button } from "@/components/ui/button";
import type { MyTrip } from "@/lib/communities-api";

export default function ReturnTripCard({ trip }: { trip: MyTrip }) {
  const router = useRouter();
  const context = trip.passengerRequest;
  const [start, setStart] = useState(context?.returnWindow?.start ?? "");
  const [end, setEnd] = useState(context?.returnWindow?.end ?? "");
  const [error, setError] = useState(false);
  if (
    !context ||
    trip.role !== "passenger" ||
    trip.status !== "accepted" ||
    trip.direction !== "outbound"
  )
    return null;
  const days = context.daysOfWeek?.filter((day) => trip.daysOfWeek?.includes(day)) ?? [];
  const date = context.date ?? trip.date;
  if (context.date && trip.date && context.date !== trip.date) return null;
  if (
    context.date &&
    trip.daysOfWeek &&
    !trip.daysOfWeek.includes(new Date(`${context.date}T12:00:00Z`).getUTCDay() || 7)
  )
    return null;
  if (
    trip.date &&
    context.daysOfWeek &&
    !context.daysOfWeek.includes(new Date(`${trip.date}T12:00:00Z`).getUTCDay() || 7)
  )
    return null;
  if (!date && days.length === 0) return null;

  return (
    <section aria-label="¿Y el regreso?" className="space-y-3 rounded-2xl border bg-card p-4">
      <h2 className="text-lg font-bold">¿Y el regreso?</h2>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!start || !end || start >= end) {
            setError(true);
            return;
          }
          const params = new URLSearchParams({
            direction: "return",
            communityId: context.communityId,
            originZoneId: context.originZoneId,
            windowStart: start,
            windowEnd: end,
            fallbackMode: context.fallbackMode,
            ...(date ? { date } : { daysOfWeek: days.join(",") }),
          });
          router.push(`/buscar?${params}`);
        }}
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">{`Salir de ${trip.destinationName} entre`}</legend>
          <div className="flex gap-3">
            <label className="text-sm">
              Desde
              <input
                aria-label="Desde"
                type="time"
                required
                value={start}
                onChange={(event) => setStart(event.target.value)}
                className="block rounded border p-2"
              />
            </label>
            <label className="text-sm">
              Hasta
              <input
                aria-label="Hasta"
                type="time"
                required
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                className="block rounded border p-2"
              />
            </label>
          </div>
        </fieldset>
        <p className="text-sm">{date ? dateLabel(date) : daysLabel(days)}</p>
        <Button type="submit">Buscar regreso</Button>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            Elige una ventana de salida válida.
          </p>
        ) : null}
      </form>
    </section>
  );
}

"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";

import EmptyState from "@/components/empty-state";
import ProfileAvatar from "@/components/profile-avatar";
import { RowChevron } from "@/components/row-chevron";
import { communitiesApi, type MyChatsResponse } from "@/lib/communities-api";

import { clockLabel } from "../buscar/schedule";

export default function ChatList() {
  const [chats, setChats] = useState<MyChatsResponse["chats"] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    communitiesApi
      .listMyChats()
      .then(({ chats: result }) => {
        if (active) setChats(result);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="space-y-4 px-4 pt-2 pb-6">
      <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Chat</h1>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          No pudimos cargar tus conversaciones.
        </p>
      ) : !chats ? (
        <p role="status" className="text-sm text-muted-foreground">
          Cargando conversaciones…
        </p>
      ) : chats.length === 0 ? (
        <EmptyState>Aún no tienes conversaciones. Aparecerán cuando aceptes un viaje.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {chats.map((chat) => (
            <li key={`${chat.offerId}-${chat.role}`}>
              <Link
                className="flex items-start gap-3 rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:bg-muted/60"
                href={`/chat/${chat.offerId}` as Route}
              >
                <ProfileAvatar
                  name={chat.driverName}
                  photoUrl={chat.driverPhotoUrl}
                  className="size-11"
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate font-semibold">{`${chat.originZoneName} → ${chat.destinationName}`}</p>
                  <p className="text-sm">{`${chat.driverName} · ${chat.role === "driver" ? "Conductor" : "Pasajero"}`}</p>
                  <p className="text-[0.8125rem] text-muted-foreground">{`${chat.communityName} · ${clockLabel(chat.departureTime.slice(0, 5))}`}</p>
                  {chat.meetingPointName ? (
                    <p className="text-[0.8125rem] text-muted-foreground">{`Punto de encuentro: ${chat.meetingPointName}`}</p>
                  ) : null}
                </div>
                <span className="self-center">
                  <RowChevron />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

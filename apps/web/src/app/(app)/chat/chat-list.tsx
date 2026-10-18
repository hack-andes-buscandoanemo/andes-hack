"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";

import ProfileAvatar from "@/components/profile-avatar";
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
    <main className="mx-auto w-full max-w-md space-y-4 px-4 py-6">
      <h1 className="text-2xl font-extrabold">Chat</h1>
      {error ? (
        <p role="alert">No pudimos cargar tus conversaciones.</p>
      ) : !chats ? (
        <p role="status">Cargando conversaciones…</p>
      ) : chats.length === 0 ? (
        <p>Aún no tienes conversaciones. Aparecerán cuando aceptes un viaje.</p>
      ) : (
        <ul className="space-y-3">
          {chats.map((chat) => (
            <li key={`${chat.offerId}-${chat.role}`}>
              <Link
                className="block rounded-2xl border p-4"
                href={`/chat/${chat.offerId}` as Route}
              >
                <p className="font-bold">{`${chat.originZoneName} → ${chat.destinationName}`}</p>
                <div className="flex items-center gap-2">
                  <ProfileAvatar
                    name={chat.driverName}
                    photoUrl={chat.driverPhotoUrl}
                    className="size-9"
                  />
                  <p>{`${chat.driverName} · ${chat.role === "driver" ? "Conductor" : "Pasajero"}`}</p>
                </div>
                <p>{`${chat.communityName} · ${clockLabel(chat.departureTime.slice(0, 5))}`}</p>
                {chat.meetingPointName ? (
                  <p>{`Punto de encuentro: ${chat.meetingPointName}`}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

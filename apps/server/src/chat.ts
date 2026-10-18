import type { db as defaultDb } from "@andes-hack/db";
import { user as userTable } from "@andes-hack/db/schema/auth";
import { community, communityMember } from "@andes-hack/db/schema/community";
import { meetingPoint, zone } from "@andes-hack/db/schema/places";
import { seatBooking, tripMessage, tripOffer } from "@andes-hack/db/schema/trips";
import { aliasedTable, and, asc, eq, inArray, sql } from "drizzle-orm";
import { routeMapFor } from "@andes-hack/matching";

import { getCommunityProfilePhotos, type ProfilePhotoStorageResolver } from "./profile-photos";
import { ApiError } from "./utils/api-response";
import { currentDay, loadDays } from "./trip-days";
import { limaClock } from "./trip-rules";
import { destinationOf } from "./search";

type Database = typeof defaultDb;
type ChatSummary = {
  offerId: string;
  communityId: string;
  driverId: string;
  role: "driver" | "passenger";
  driverName: string;
  driverPhotoUrl: string | null;
  communityName: string;
  originZoneName: string;
  destinationName: string;
  departureTime: string;
  date: string | null;
  daysOfWeek: number[] | null;
  meetingPointName: string | null;
};

async function loadConversation(
  database: Database,
  offerId: string,
  userId: string,
  now = new Date(),
) {
  const [offer] = await database
    .select({
      id: tripOffer.id,
      status: tripOffer.status,
      driverId: tripOffer.driverId,
      communityId: tripOffer.communityId,
      communityName: community.name,
      originZoneName: zone.name,
      originZoneId: tripOffer.originZoneId,
      destinationName: community.destinationName,
      direction: tripOffer.direction,
      departureTime: tripOffer.departureTime,
      date: tripOffer.date,
      daysOfWeek: tripOffer.daysOfWeek,
      driverAlias: communityMember.alias,
      driverAccountName: userTable.name,
    })
    .from(tripOffer)
    .innerJoin(community, eq(tripOffer.communityId, community.id))
    .innerJoin(zone, eq(tripOffer.originZoneId, zone.id))
    .innerJoin(userTable, eq(tripOffer.driverId, userTable.id))
    .innerJoin(
      communityMember,
      and(
        eq(communityMember.communityId, tripOffer.communityId),
        eq(communityMember.userId, tripOffer.driverId),
      ),
    )
    .where(eq(tripOffer.id, offerId))
    .limit(1);
  if (!offer) throw new ApiError(404, "No encontramos este viaje.", { code: "offer_not_found" });
  if (offer.status === "cancelled") {
    throw new ApiError(403, "Este viaje fue cancelado.", { code: "trip_participant_required" });
  }

  const accepted = await database
    .select({
      id: seatBooking.id,
      passengerId: seatBooking.passengerId,
      passengerAlias: communityMember.alias,
      passengerAccountName: userTable.name,
      meetingPointName: meetingPoint.name,
      meetingPointId: meetingPoint.id,
      meetingPointLat: meetingPoint.lat,
      meetingPointLng: meetingPoint.lng,
      pickupAt: seatBooking.pickupAt,
      status: seatBooking.status,
    })
    .from(seatBooking)
    .innerJoin(
      communityMember,
      and(
        eq(communityMember.communityId, offer.communityId),
        eq(communityMember.userId, seatBooking.passengerId),
      ),
    )
    .innerJoin(userTable, eq(userTable.id, seatBooking.passengerId))
    .innerJoin(meetingPoint, eq(meetingPoint.id, seatBooking.meetingPointId))
    .where(
      and(
        eq(seatBooking.offerId, offer.id),
        inArray(seatBooking.status, ["accepted", "completed"]),
      ),
    );
  const isDriver = offer.driverId === userId;
  if (!isDriver && !accepted.some((booking) => booking.passengerId === userId)) {
    throw new ApiError(403, "Solo los participantes aceptados pueden ver este chat.", {
      code: "trip_participant_required",
    });
  }

  const driverName = offer.driverAlias ?? offer.driverAccountName;
  const participants = [
    { name: driverName, role: "driver" as const },
    ...accepted.map((booking) => ({
      name: booking.passengerAlias ?? booking.passengerAccountName,
      role: "passenger" as const,
    })),
  ];
  const visibleBookings = isDriver
    ? accepted
    : accepted.filter((booking) => booking.passengerId === userId);
  const outbound = offer.direction === "outbound";
  const today = limaClock(now).today;
  const days = await loadDays(
    database,
    accepted.map((booking) => booking.id),
    today,
  );
  const current = accepted.map((booking) =>
    offer.date
      ? days.get(booking.id)?.find((day) => day.tripDate === offer.date)
      : currentDay(days.get(booking.id) ?? [], today),
  );
  const tripDate =
    current.find((day) => day?.startedAt && !day.outcome)?.tripDate ?? offer.date ?? today;
  const occurrence = current.map((day) => (day?.tripDate === tripDate ? day : undefined));
  const completed =
    occurrence.some((day) => day?.outcome === "completed") &&
    occurrence.every((day) => !!day?.outcome);
  const underway =
    occurrence.some((day) => !!day?.startedAt) &&
    occurrence.every((day) => !!day?.startedAt || !!day?.outcome);

  return {
    isDriver,
    communityId: offer.communityId,
    driverId: offer.driverId,
    participantIds: [offer.driverId, ...accepted.map((booking) => booking.passengerId)].filter(
      (id): id is string => Boolean(id),
    ),
    conversation: {
      offerId: offer.id,
      tripDate,
      tripState: completed
        ? ("completed" as const)
        : underway
          ? ("in_progress" as const)
          : ("confirmed" as const),
      communityName: offer.communityName,
      origin: outbound ? offer.originZoneName : offer.destinationName,
      destination: outbound ? offer.destinationName : offer.originZoneName,
      departureTime: offer.departureTime,
      date: offer.date,
      daysOfWeek: offer.daysOfWeek,
      role: isDriver ? ("driver" as const) : ("passenger" as const),
      participants,
      routeMap: routeMapFor({
        direction: offer.direction,
        originZoneId: offer.originZoneId,
        destinationId: destinationOf(offer).id,
        stops: [
          ...new Map(
            visibleBookings
              .toSorted((a, b) => a.pickupAt.localeCompare(b.pickupAt))
              .map((booking) => [
                booking.meetingPointId,
                { meetingPointId: booking.meetingPointId, mine: booking.passengerId === userId },
              ]),
          ).values(),
        ],
      }),
      meetingPoints: visibleBookings.map((booking) => ({
        participantName: booking.passengerAlias ?? booking.passengerAccountName,
        name: booking.meetingPointName,
        lat: booking.meetingPointLat,
        lng: booking.meetingPointLng,
      })),
    },
  };
}

export async function listMyChats(
  database: Database,
  userId: string,
  storageForPhotos?: ProfilePhotoStorageResolver,
) {
  const passengers = await database
    .select({
      offerId: tripOffer.id,
      communityId: tripOffer.communityId,
      driverId: tripOffer.driverId,
      communityName: community.name,
      originZoneName: zone.name,
      destinationName: community.destinationName,
      direction: tripOffer.direction,
      departureTime: tripOffer.departureTime,
      date: tripOffer.date,
      daysOfWeek: tripOffer.daysOfWeek,
      driverName: communityMember.alias,
      driverAccountName: userTable.name,
      meetingPointName: meetingPoint.name,
    })
    .from(seatBooking)
    .innerJoin(tripOffer, eq(seatBooking.offerId, tripOffer.id))
    .innerJoin(community, eq(tripOffer.communityId, community.id))
    .innerJoin(zone, eq(tripOffer.originZoneId, zone.id))
    .innerJoin(userTable, eq(tripOffer.driverId, userTable.id))
    .innerJoin(
      communityMember,
      and(
        eq(communityMember.userId, tripOffer.driverId),
        eq(communityMember.communityId, tripOffer.communityId),
      ),
    )
    .innerJoin(meetingPoint, eq(meetingPoint.id, seatBooking.meetingPointId))
    .where(
      and(
        eq(seatBooking.passengerId, userId),
        inArray(seatBooking.status, ["accepted", "completed"]),
      ),
    );

  const drivers = await database
    .select({
      offerId: tripOffer.id,
      communityId: tripOffer.communityId,
      driverId: tripOffer.driverId,
      communityName: community.name,
      originZoneName: zone.name,
      destinationName: community.destinationName,
      direction: tripOffer.direction,
      departureTime: tripOffer.departureTime,
      date: tripOffer.date,
      daysOfWeek: tripOffer.daysOfWeek,
      driverName: communityMember.alias,
      driverAccountName: userTable.name,
    })
    .from(tripOffer)
    .innerJoin(
      seatBooking,
      and(
        eq(seatBooking.offerId, tripOffer.id),
        inArray(seatBooking.status, ["accepted", "completed"]),
      ),
    )
    .innerJoin(community, eq(tripOffer.communityId, community.id))
    .innerJoin(zone, eq(tripOffer.originZoneId, zone.id))
    .innerJoin(userTable, eq(tripOffer.driverId, userTable.id))
    .innerJoin(
      communityMember,
      and(
        eq(communityMember.userId, tripOffer.driverId),
        eq(communityMember.communityId, tripOffer.communityId),
      ),
    )
    .where(eq(tripOffer.driverId, userId));

  const chats = new Map<string, ChatSummary>();
  for (const row of [
    ...drivers.map((row) => ({ ...row, role: "driver" as const, meetingPointName: null })),
    ...passengers.map((row) => ({ ...row, role: "passenger" as const })),
  ]) {
    const outbound = row.direction === "outbound";
    const key = `${row.offerId}:${row.role}`;
    chats.set(key, {
      offerId: row.offerId,
      communityId: row.communityId,
      driverId: row.driverId!,
      role: row.role,
      driverName: row.driverName ?? row.driverAccountName,
      driverPhotoUrl: null,
      communityName: row.communityName,
      originZoneName: outbound ? row.originZoneName : row.destinationName,
      destinationName: outbound ? row.destinationName : row.originZoneName,
      departureTime: row.departureTime,
      date: row.date,
      daysOfWeek: row.daysOfWeek,
      meetingPointName: row.meetingPointName,
    });
  }
  const rows = [...chats.values()];
  const idsByCommunity = new Map<string, Set<string>>();
  for (const row of rows) {
    const ids = idsByCommunity.get(row.communityId) ?? new Set<string>();
    ids.add(row.driverId);
    idsByCommunity.set(row.communityId, ids);
  }
  const photoUrls = new Map<string, string>();
  for (const [communityId, ids] of idsByCommunity) {
    const urls = await getCommunityProfilePhotos(database, storageForPhotos, communityId, [...ids]);
    for (const [userId, url] of urls) photoUrls.set(`${communityId}:${userId}`, url);
  }
  return {
    chats: rows.map(({ communityId, driverId, ...chat }) => ({
      ...chat,
      driverPhotoUrl: photoUrls.get(`${communityId}:${driverId}`) ?? null,
    })),
  };
}

export async function getTripMessages(
  database: Database,
  input: { offerId: string; userId: string; after?: string; now?: Date },
  storageForPhotos?: ProfilePhotoStorageResolver,
) {
  const { conversation, communityId, driverId, participantIds } = await loadConversation(
    database,
    input.offerId,
    input.userId,
    input.now,
  );
  const cursorMessage = aliasedTable(tripMessage, "cursor_message");
  const messages = await database
    .select({
      id: tripMessage.id,
      senderId: tripMessage.senderId,
      senderAlias: communityMember.alias,
      senderAccountName: userTable.name,
      kind: tripMessage.kind,
      body: tripMessage.body,
      createdAt: tripMessage.createdAt,
    })
    .from(tripMessage)
    .innerJoin(userTable, eq(userTable.id, tripMessage.senderId))
    .leftJoin(
      communityMember,
      and(
        eq(communityMember.userId, tripMessage.senderId),
        eq(communityMember.communityId, communityId),
      ),
    )
    .where(
      and(
        eq(tripMessage.offerId, input.offerId),
        input.after
          ? sql`ROW(${tripMessage.createdAt}, ${tripMessage.id}) > (
              SELECT ${cursorMessage.createdAt}, ${cursorMessage.id}
              FROM ${tripMessage} AS ${sql.identifier("cursor_message")}
              WHERE ${cursorMessage.id} = ${input.after}
                AND ${cursorMessage.offerId} = ${input.offerId}
            )`
          : undefined,
      ),
    )
    .orderBy(asc(tripMessage.createdAt), asc(tripMessage.id))
    .limit(100);
  const photoUrls = await getCommunityProfilePhotos(database, storageForPhotos, communityId, [
    ...participantIds,
    ...messages.map((message) => message.senderId),
  ]);
  return {
    conversation: {
      ...conversation,
      participants: conversation.participants.map((participant, index) => ({
        ...participant,
        photoUrl: photoUrls.get(participantIds[index]!) ?? null,
      })),
    },
    messages: messages.map((message) => ({
      id: message.id,
      senderName: message.senderAlias ?? message.senderAccountName,
      senderPhotoUrl: photoUrls.get(message.senderId) ?? null,
      senderRole: message.senderId === driverId ? ("driver" as const) : ("passenger" as const),
      kind: message.kind,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

export async function sendTripMessage(
  database: Database,
  input: { offerId: string; userId: string; kind: "text" | "quick"; body: string },
  storageForPhotos?: ProfilePhotoStorageResolver,
) {
  const { conversation, communityId } = await loadConversation(
    database,
    input.offerId,
    input.userId,
  );
  const [row] = await database
    .insert(tripMessage)
    .values({ offerId: input.offerId, senderId: input.userId, kind: input.kind, body: input.body })
    .returning();
  const [sender] = await database
    .select({ alias: communityMember.alias, name: userTable.name })
    .from(userTable)
    .leftJoin(
      communityMember,
      and(eq(communityMember.userId, userTable.id), eq(communityMember.communityId, communityId)),
    )
    .where(eq(userTable.id, input.userId))
    .limit(1);
  const photoUrls = await getCommunityProfilePhotos(database, storageForPhotos, communityId, [
    input.userId,
  ]);
  return {
    message: {
      id: row!.id,
      senderName: sender?.alias ?? sender?.name ?? "Miembro",
      senderPhotoUrl: photoUrls.get(input.userId) ?? null,
      senderRole: conversation.role,
      kind: row!.kind,
      body: row!.body,
      createdAt: row!.createdAt.toISOString(),
    },
  };
}

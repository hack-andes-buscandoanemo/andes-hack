import type { TripMatch } from "@andes-hack/api";
import type { db as defaultDb } from "@andes-hack/db";
import { user as userTable } from "@andes-hack/db/schema/auth";
import { community, communityMember } from "@andes-hack/db/schema/community";
import { matchRun, matchSuggestion } from "@andes-hack/db/schema/matching";
import { meetingPoint, zone } from "@andes-hack/db/schema/places";
import { seatBooking, tripOffer, tripRequest } from "@andes-hack/db/schema/trips";
import { vehicle } from "@andes-hack/db/schema/vehicle";
import {
  createTravelTimeModel,
  places,
  rankOffersForRequest,
  routeMapFor,
} from "@andes-hack/matching";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { fuelEstimateFor, occupantsSharingFuel } from "./fuel-estimate";
import { liveOfferIds } from "./live-location";
import { destinationOf, loadOfferRoutes, matchOfferForNeed, toRideRequest } from "./search";
import { getCommunityProfilePhotos, type ProfilePhotoStorageResolver } from "./profile-photos";
import { currentDay, dayState, loadDays } from "./trip-days";
import { canSeePlate, displayName, limaClock, seatsFree } from "./trip-rules";
import { ApiError } from "./utils/api-response";

type Database = typeof defaultDb;
const model = createTravelTimeModel();

// The stops the map shows (US-037): where the accepted passengers board, and where the
// person would, from their request or else from the engine's pickup for their need, in
// pickup order. A point several people share is one stop, the person's own if it is theirs.
function mapStops(
  bookings: {
    passengerId: string | null;
    status: string;
    meetingPointId: string;
    pickupAt: string;
  }[],
  userId: string,
  match: { meetingPointId: string; pickupAt: string } | null,
) {
  const own = bookings.find(
    (booking) =>
      booking.passengerId === userId &&
      (booking.status === "pending" || booking.status === "accepted"),
  );
  const mine = own ?? match;
  const stops = [
    ...bookings
      .filter((booking) => booking.status === "accepted" && booking.passengerId !== userId)
      .map((booking) => ({ ...booking, mine: false })),
    ...(mine ? [{ ...mine, mine: true }] : []),
  ].toSorted((a, b) => a.pickupAt.slice(0, 5).localeCompare(b.pickupAt.slice(0, 5)));
  const byPoint = new Map<string, boolean>();
  for (const stop of stops) {
    byPoint.set(stop.meetingPointId, (byPoint.get(stop.meetingPointId) ?? false) || stop.mine);
  }
  return [...byPoint].map(([meetingPointId, mine]) => ({ meetingPointId, mine }));
}

async function loadOfferDetail(database: Database, input: { offerId: string; userId: string }) {
  const [row] = await database
    .select({
      id: tripOffer.id,
      communityId: tripOffer.communityId,
      driverId: tripOffer.driverId,
      communityName: community.name,
      destinationName: community.destinationName,
      originZoneId: tripOffer.originZoneId,
      originZoneName: zone.name,
      status: tripOffer.status,
      direction: tripOffer.direction,
      departureTime: tripOffer.departureTime,
      date: tripOffer.date,
      daysOfWeek: tripOffer.daysOfWeek,
      seatsTotal: tripOffer.seatsTotal,
      note: tripOffer.note,
      priceCents: tripOffer.priceCents,
      paymentMethods: tripOffer.paymentMethods,
      driverAlias: communityMember.alias,
      accountName: userTable.name,
      make: vehicle.make,
      model: vehicle.model,
      plate: vehicle.plate,
    })
    .from(tripOffer)
    .innerJoin(community, eq(tripOffer.communityId, community.id))
    .innerJoin(zone, eq(tripOffer.originZoneId, zone.id))
    .innerJoin(userTable, eq(tripOffer.driverId, userTable.id))
    .leftJoin(
      communityMember,
      and(
        eq(communityMember.userId, tripOffer.driverId),
        eq(communityMember.communityId, tripOffer.communityId),
      ),
    )
    .leftJoin(vehicle, eq(tripOffer.vehicleId, vehicle.id))
    .where(eq(tripOffer.id, input.offerId))
    .limit(1);
  if (!row) {
    throw new ApiError(404, "No encontramos este viaje.", { code: "offer_not_found" });
  }

  const [membership] = await database
    .select({
      identifiesAsWoman: communityMember.identifiesAsWoman,
      isTeam: communityMember.isTeam,
    })
    .from(communityMember)
    .where(
      and(
        eq(communityMember.communityId, row.communityId),
        eq(communityMember.userId, input.userId),
      ),
    )
    .limit(1);
  // Other communities get the same answer as an unknown id, so ids cannot be probed.
  if (!membership) {
    throw new ApiError(404, "No encontramos este viaje.", { code: "offer_not_found" });
  }

  const bookings = await database
    .select({
      id: seatBooking.id,
      passengerId: seatBooking.passengerId,
      requestId: seatBooking.requestId,
      status: seatBooking.status,
      meetingPointId: seatBooking.meetingPointId,
      pickupAt: seatBooking.pickupAt,
      passengerAlias: communityMember.alias,
      passengerAccountName: userTable.name,
    })
    .from(seatBooking)
    .innerJoin(userTable, eq(seatBooking.passengerId, userTable.id))
    .leftJoin(
      communityMember,
      and(
        eq(communityMember.userId, seatBooking.passengerId),
        eq(communityMember.communityId, row.communityId),
      ),
    )
    .where(
      and(
        eq(seatBooking.offerId, row.id),
        inArray(seatBooking.status, [
          "pending",
          "accepted",
          "rejected",
          "cancelled_by_driver",
          "completed",
          "no_show",
        ]),
      ),
    )
    .orderBy(desc(seatBooking.createdAt));
  const isOwn = row.driverId === input.userId;
  const mine = bookings.find((booking) => booking.passengerId === input.userId);
  const acceptedCount = bookings.filter((booking) => booking.status === "accepted").length;
  const canReport = isOwn || ["accepted", "completed", "no_show"].includes(mine?.status ?? "");
  const reportTargets = canReport
    ? [
        ...(isOwn
          ? []
          : [{ id: row.driverId!, name: displayName(row.driverAlias, row.accountName) }]),
        ...new Map(
          bookings
            .filter(
              (booking) =>
                booking.passengerId !== null &&
                booking.passengerId !== input.userId &&
                ["accepted", "completed", "no_show"].includes(booking.status),
            )
            .map((booking) => [
              booking.passengerId,
              {
                id: booking.passengerId!,
                name: displayName(booking.passengerAlias, booking.passengerAccountName),
              },
            ]),
        ).values(),
      ]
    : [];

  const destination = destinationOf(row);
  const live = (await liveOfferIds(database, [row.id], new Date())).has(row.id);
  // The person's open need in this direction, saved by their last search.
  const [need] = await database
    .select()
    .from(tripRequest)
    .where(
      and(
        eq(tripRequest.communityId, row.communityId),
        eq(tripRequest.passengerId, input.userId),
        eq(tripRequest.direction, row.direction),
        eq(tripRequest.status, "open"),
      ),
    )
    .orderBy(desc(tripRequest.createdAt))
    .limit(1);
  const match = need
    ? await matchOfferForNeed(database, {
        offerId: row.id,
        communityId: row.communityId,
        userId: input.userId,
        passengerIsWoman: membership.identifiesAsWoman,
        destination,
        need,
      })
    : null;

  const detail = {
    offerId: row.id,
    status: row.status,
    driverName: displayName(row.driverAlias, row.accountName),
    reportTargets,
    communityName: row.communityName,
    originZoneName: row.originZoneName,
    destinationName: destination.name,
    direction: row.direction,
    departureTime: row.departureTime,
    date: row.date,
    daysOfWeek: row.daysOfWeek,
    // Same count the engine and the search use: accepted passengers hold the seats.
    seatsFree: seatsFree(row.seatsTotal, acceptedCount),
    vehicle:
      row.make && row.model
        ? {
            make: row.make,
            model: row.model,
            // Never revealed once the trip is cancelled.
            plate: canSeePlate({
              offerStatus: row.status,
              isOwn,
              bookingStatus: mine?.status,
            })
              ? row.plate
              : null,
          }
        : null,
    note: row.note,
    isOwn,
    hasOpenNeed: Boolean(need),
    match: match && {
      meetingPointName:
        places.meetingPoints.find((point) => point.id === match.meetingPointId)?.name ??
        match.meetingPointId,
      pickupAt: match.pickupAt,
      arrivalAt: match.arrivalAt,
      detourMinutes: match.detourMinutes,
      walkMinutes: match.walkMinutes,
    },
    booking: mine ? { id: mine.id, status: mine.status } : null,
    fuelEstimate: fuelEstimateFor({
      direction: row.direction,
      originZoneId: row.originZoneId,
      destinationId: destination.id,
      occupants: occupantsSharingFuel(acceptedCount, isOwn || mine?.status === "accepted"),
    }),
    priceCents: row.priceCents,
    paymentMethods: row.paymentMethods,
    live,
    routeMap: routeMapFor({
      direction: row.direction,
      originZoneId: row.originZoneId,
      destinationId: destination.id,
      stops: mapStops(bookings, input.userId, match),
    }),
    alternatives: undefined as TripMatch[] | undefined,
  };

  const needRow =
    need ??
    (mine?.requestId
      ? (
          await database
            .select()
            .from(tripRequest)
            .where(eq(tripRequest.id, mine.requestId))
            .limit(1)
        )[0]
      : undefined);

  if (mine?.status === "cancelled_by_driver" && needRow) {
    const {
      rows: altRows,
      routes: altRoutes,
      acceptedByOffer,
    } = await loadOfferRoutes(database, {
      communityId: row.communityId,
      userId: input.userId,
      destination,
      where: and(
        eq(tripOffer.communityId, row.communityId),
        eq(tripOffer.status, "active"),
        ne(tripOffer.id, row.id),
        ne(tripOffer.driverId, input.userId),
      ),
    });

    const request = toRideRequest(needRow, {
      userId: input.userId,
      communityId: row.communityId,
      womenOnly: needRow.womenOnly,
      passengerIsWoman: membership.identifiesAsWoman,
    });

    const ranking = rankOffersForRequest(request, altRoutes, model);
    const byId = new Map(altRows.map((r) => [r.id, r]));
    const meetingPointNames = new Map(places.meetingPoints.map((point) => [point.id, point.name]));
    const photoUrls = await getCommunityProfilePhotos(
      database,
      undefined,
      row.communityId,
      altRows.flatMap((r) => (r.driverId ? [r.driverId] : [])),
    );
    const altLive = await liveOfferIds(
      database,
      ranking.matches.map((m) => m.offerId),
      new Date(),
    );

    detail.alternatives = ranking.matches.map((m) => {
      const altOffer = byId.get(m.offerId)!;
      const accepted = acceptedByOffer.get(altOffer.id) ?? [];
      return {
        offerId: m.offerId,
        driverName: displayName(altOffer.driverName, altOffer.accountName),
        driverPhotoUrl: altOffer.driverId ? (photoUrls.get(altOffer.driverId) ?? null) : null,
        originZoneName: altOffer.originZoneName,
        destinationName: destination.name,
        direction: altOffer.direction,
        departureTime: altOffer.departureTime,
        seatsFree: seatsFree(altOffer.seatsTotal, accepted.length),
        meetingPointName: meetingPointNames.get(m.meetingPointId) ?? m.meetingPointId,
        pickupAt: m.pickupAt,
        arrivalAt: m.arrivalAt,
        detourMinutes: m.detourMinutes,
        walkMinutes: m.walkMinutes,
        priceCents: altOffer.priceCents,
        paymentMethods: altOffer.paymentMethods,
        live: altLive.has(altOffer.id),
        fuelEstimate: fuelEstimateFor({
          direction: altOffer.direction,
          originZoneId: altOffer.originZoneId,
          destinationId: destination.id,
          occupants: occupantsSharingFuel(
            accepted.length,
            accepted.some((b) => b.passengerId === input.userId),
          ),
        }),
      };
    });
  }
  return {
    detail,
    need,
    match,
    communityId: row.communityId,
    driverId: row.driverId,
    passengerIsTeam: membership.isTeam,
  };
}

export async function getOfferDetail(
  database: Database,
  input: { offerId: string; userId: string },
  storageForPhotos?: ProfilePhotoStorageResolver,
) {
  const result = await loadOfferDetail(database, input);
  const photoUrls = result.driverId
    ? await getCommunityProfilePhotos(database, storageForPhotos, result.communityId, [
        result.driverId,
      ])
    : new Map<string, string>();
  return {
    ...result.detail,
    driverPhotoUrl: result.driverId ? (photoUrls.get(result.driverId) ?? null) : null,
  };
}

export async function requestSeat(
  database: Database,
  input: { offerId: string; userId: string; message?: string },
) {
  const { detail, match, need, passengerIsTeam } = await loadOfferDetail(database, input);
  const [rejected] = await database
    .select({ id: seatBooking.id })
    .from(seatBooking)
    .where(
      and(
        eq(seatBooking.offerId, input.offerId),
        eq(seatBooking.passengerId, input.userId),
        eq(seatBooking.status, "rejected"),
      ),
    )
    .limit(1);
  if (rejected) {
    throw new ApiError(409, "El conductor no pudo aceptar tu solicitud.", {
      code: "previously_rejected",
    });
  }
  const alreadyRequested = new ApiError(409, "Ya solicitaste un asiento en este viaje.", {
    code: "already_requested",
  });
  const noLongerCompatible = new ApiError(
    409,
    "Este viaje cambió y ya no es compatible con tu búsqueda.",
    { code: "no_longer_compatible" },
  );
  if (detail.isOwn) {
    throw new ApiError(403, "No puedes solicitar un asiento en tu propio viaje.", {
      code: "own_offer",
    });
  }
  if (detail.booking) throw alreadyRequested;
  // A paused or cancelled trip can no longer be requested, whatever the person searched.
  if (detail.status !== "active") throw noLongerCompatible;
  if (detail.seatsFree <= 0) {
    throw new ApiError(409, "Este viaje ya no tiene asientos libres.", { code: "no_seats" });
  }
  if (!need) {
    throw new ApiError(409, "Busca tu viaje antes de solicitar un asiento.", {
      code: "search_required",
    });
  }
  if (!match) {
    throw noLongerCompatible;
  }
  const [booking] = await database
    .insert(seatBooking)
    .values({
      offerId: input.offerId,
      requestId: need.id,
      passengerId: input.userId,
      passengerWasTeam: passengerIsTeam,
      meetingPointId: match.meetingPointId,
      pickupAt: match.pickupAt,
      detourMinutes: match.detourMinutes,
      walkMinutes: match.walkMinutes,
      message: input.message,
    })
    .returning()
    // Two taps at once: the partial unique index lets only one active request through.
    .catch((error: unknown) => {
      const code = (error as { cause?: { code?: string }; code?: string }).cause?.code;
      throw code === "23505" ? alreadyRequested : error;
    });
  return {
    booking: {
      id: booking!.id,
      status: booking!.status,
      message: booking!.message,
      meetingPointName: places.meetingPoints.find((point) => point.id === match.meetingPointId)!
        .name,
      pickupAt: match.pickupAt,
      arrivalAt: match.arrivalAt,
      detourMinutes: match.detourMinutes,
      walkMinutes: match.walkMinutes,
    },
  };
}

export function isLateCancellation(
  timeStr: string,
  dateStr: string | null,
  daysOfWeek: number[] | null,
  now: Date,
): boolean {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const limaFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayLima = limaFormatter.format(now);

  let tripDateStr = dateStr;
  if (!tripDateStr && daysOfWeek && daysOfWeek.length > 0) {
    const limaDay = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Lima",
      weekday: "short",
    }).format(now);
    const dayMap: Record<string, number> = {
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
      Sun: 7,
    };
    const currentIsoDay = dayMap[limaDay];
    if (currentIsoDay && daysOfWeek.includes(currentIsoDay)) {
      tripDateStr = todayLima;
    } else {
      return false;
    }
  }

  if (!tripDateStr) return false;

  const targetTimeIso = `${tripDateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00-05:00`;
  const targetDate = new Date(targetTimeIso);
  const diffMs = targetDate.getTime() - now.getTime();
  return diffMs < 60 * 60 * 1000;
}

export async function withdrawRequest(
  database: Database,
  input: { bookingId: string; userId: string; now?: Date },
) {
  const [mine] = await database
    .select({
      id: seatBooking.id,
      offerId: seatBooking.offerId,
      status: seatBooking.status,
      pickupAt: seatBooking.pickupAt,
      departureTime: tripOffer.departureTime,
      date: tripOffer.date,
      daysOfWeek: tripOffer.daysOfWeek,
    })
    .from(seatBooking)
    .innerJoin(tripOffer, eq(seatBooking.offerId, tripOffer.id))
    .where(and(eq(seatBooking.id, input.bookingId), eq(seatBooking.passengerId, input.userId)))
    .limit(1);
  if (!mine) {
    throw new ApiError(404, "No encontramos esta solicitud.", { code: "booking_not_found" });
  }
  const now = input.now ?? new Date();
  const lateCancelled = isLateCancellation(mine.pickupAt, mine.date, mine.daysOfWeek, now);
  // Withdrawing twice changes nothing.
  if (mine.status === "cancelled_by_passenger") {
    return {
      booking: { id: mine.id, status: mine.status },
      lateCancelled,
    };
  }
  if (mine.status !== "pending" && mine.status !== "accepted") {
    throw new ApiError(409, "Esta solicitud ya no se puede retirar.", { code: "not_withdrawable" });
  }

  if (mine.status === "accepted") {
    const result = await database.execute(sql`
      WITH candidate AS MATERIALIZED (
        SELECT id, offer_id
        FROM seat_booking
        WHERE id = ${mine.id} AND status = 'accepted'
        FOR UPDATE
      ), released AS (
        UPDATE trip_offer
        SET seats_taken = GREATEST(seats_taken - 1, 0)
        WHERE id = (SELECT offer_id FROM candidate)
        RETURNING id
      ), cancelled AS (
        UPDATE seat_booking
        SET status = 'cancelled_by_passenger', updated_at = now()
        WHERE id = (SELECT id FROM candidate)
        RETURNING id, status
      )
      SELECT id, status FROM cancelled
    `);
    const cancelled = result.rows[0] as
      | { id: string; status: "cancelled_by_passenger" }
      | undefined;
    return {
      booking: cancelled ?? { id: mine.id, status: "cancelled_by_passenger" as const },
      lateCancelled,
    };
  }

  const [booking] = await database
    .update(seatBooking)
    .set({ status: "cancelled_by_passenger" })
    .where(and(eq(seatBooking.id, mine.id), eq(seatBooking.status, "pending")))
    .returning({ id: seatBooking.id, status: seatBooking.status });
  return {
    booking: booking ?? { id: mine.id, status: "cancelled_by_passenger" as const },
    lateCancelled,
  };
}
export async function acceptSeatRequest(
  database: Database,
  input: { bookingId: string; userId: string },
) {
  const [booking] = await database
    .select({
      offerId: seatBooking.offerId,
      status: seatBooking.status,
      driverId: tripOffer.driverId,
    })
    .from(seatBooking)
    .innerJoin(tripOffer, eq(seatBooking.offerId, tripOffer.id))
    .where(eq(seatBooking.id, input.bookingId))
    .limit(1);
  if (!booking) {
    throw new ApiError(404, "Esta solicitud ya no está disponible.", { code: "booking_not_found" });
  }
  if (booking.driverId !== input.userId) {
    throw new ApiError(403, "No puedes gestionar esta solicitud.", { code: "driver_required" });
  }
  if (booking.status !== "pending") {
    throw new ApiError(409, "Esta solicitud ya no está disponible.", { code: "not_pending" });
  }

  const result = await database.execute(sql`
    WITH candidate AS MATERIALIZED (
      SELECT id, offer_id
      FROM seat_booking
      WHERE id = ${input.bookingId} AND status = 'pending'
      FOR UPDATE
    ), reserved AS (
      UPDATE trip_offer
      SET seats_taken = seats_taken + 1
      WHERE id = (SELECT offer_id FROM candidate) AND seats_taken < seats_total
      RETURNING id
    ), accepted AS (
      UPDATE seat_booking
      SET status = 'accepted', decided_at = now()
      WHERE id = (SELECT id FROM candidate) AND status = 'pending'
        AND EXISTS (SELECT 1 FROM reserved)
      RETURNING id, status
    )
    SELECT id, status FROM accepted
  `);
  const accepted = result.rows[0] as { id: string; status: string } | undefined;
  if (accepted) return { booking: { id: accepted.id, status: "accepted" as const } };

  const [current] = await database
    .select({ status: seatBooking.status })
    .from(seatBooking)
    .where(eq(seatBooking.id, input.bookingId))
    .limit(1);
  if (current?.status !== "pending") {
    throw new ApiError(409, "Esta solicitud ya no está disponible.", { code: "not_pending" });
  }
  throw new ApiError(409, "Tu auto ya está lleno.", { code: "no_seats" });
}

export async function listSeatRequests(
  database: Database,
  input: { offerId: string; userId: string; now: Date },
  storageForPhotos?: ProfilePhotoStorageResolver,
) {
  const [offer] = await database
    .select({
      id: tripOffer.id,
      communityId: tripOffer.communityId,
      driverId: tripOffer.driverId,
      seatsTaken: tripOffer.seatsTaken,
      seatsTotal: tripOffer.seatsTotal,
    })
    .from(tripOffer)
    .where(eq(tripOffer.id, input.offerId))
    .limit(1);
  if (!offer) throw new ApiError(404, "No encontramos este viaje.", { code: "offer_not_found" });
  if (offer.driverId !== input.userId) {
    throw new ApiError(403, "No puedes gestionar las solicitudes de este viaje.", {
      code: "driver_required",
    });
  }

  const requests = await database
    .select({
      id: seatBooking.id,
      passengerId: seatBooking.passengerId,
      requestId: seatBooking.requestId,
      passengerName: communityMember.alias,
      accountName: userTable.name,
      status: seatBooking.status,
      meetingPointName: meetingPoint.name,
      pickupAt: seatBooking.pickupAt,
      detourMinutes: seatBooking.detourMinutes,
      message: seatBooking.message,
      fallbackMode: tripRequest.fallbackMode,
    })
    .from(seatBooking)
    .innerJoin(tripOffer, eq(seatBooking.offerId, tripOffer.id))
    .innerJoin(
      communityMember,
      and(
        eq(communityMember.userId, seatBooking.passengerId),
        eq(communityMember.communityId, tripOffer.communityId),
      ),
    )
    .innerJoin(userTable, eq(userTable.id, seatBooking.passengerId))
    .innerJoin(tripRequest, eq(tripRequest.id, seatBooking.requestId))
    .innerJoin(meetingPoint, eq(meetingPoint.id, seatBooking.meetingPointId))
    .where(
      and(eq(seatBooking.offerId, offer.id), inArray(seatBooking.status, ["pending", "accepted"])),
    )
    .orderBy(asc(seatBooking.createdAt));

  const recommendations = await database
    .select({ requestId: matchSuggestion.requestId })
    .from(matchSuggestion)
    .innerJoin(matchRun, eq(matchRun.id, matchSuggestion.runId))
    .where(
      and(
        eq(matchSuggestion.offerId, offer.id),
        eq(matchRun.algorithm, "optimizer"),
        inArray(matchSuggestion.status, ["proposed", "accepted"]),
      ),
    );
  const recommendedRequestIds = new Set(recommendations.map(({ requestId }) => requestId));

  const photoUrls = await getCommunityProfilePhotos(
    database,
    storageForPhotos,
    offer.communityId,
    requests.map((request) => request.passengerId).filter((id): id is string => Boolean(id)),
  );
  const { today } = limaClock(input.now);
  const days = await loadDays(
    database,
    requests.map((request) => request.id),
    today,
  );
  return {
    offerId: offer.id,
    seatsTaken: offer.seatsTaken,
    seatsTotal: offer.seatsTotal,
    bookings: requests.map(
      ({ accountName, fallbackMode, pickupAt, passengerId, requestId, ...booking }) => ({
        ...booking,
        // Where the passenger is on today's trip (US-025); null while the seat is not accepted.
        today: dayState(booking.status, currentDay(days.get(booking.id) ?? [], today)),
        passengerName: booking.passengerName ?? accountName,
        passengerPhotoUrl: passengerId ? (photoUrls.get(passengerId) ?? null) : null,
        pickupAt: pickupAt.slice(0, 5),
        avoidsCar: fallbackMode === "drive_alone" || fallbackMode === "taxi_app",
        recommended: recommendedRequestIds.has(requestId),
      }),
    ),
  };
}

export async function rejectSeatRequest(
  database: Database,
  input: { bookingId: string; userId: string },
) {
  const [booking] = await database
    .select({ id: seatBooking.id, status: seatBooking.status, driverId: tripOffer.driverId })
    .from(seatBooking)
    .innerJoin(tripOffer, eq(seatBooking.offerId, tripOffer.id))
    .where(eq(seatBooking.id, input.bookingId))
    .limit(1);
  if (!booking) {
    throw new ApiError(404, "Esta solicitud ya no está disponible.", { code: "booking_not_found" });
  }
  if (booking.driverId !== input.userId) {
    throw new ApiError(403, "No puedes gestionar esta solicitud.", { code: "driver_required" });
  }
  if (booking.status !== "pending") {
    throw new ApiError(409, "Esta solicitud ya no está disponible.", { code: "not_pending" });
  }

  const [rejected] = await database
    .update(seatBooking)
    .set({ status: "rejected", decidedAt: new Date() })
    .where(and(eq(seatBooking.id, booking.id), eq(seatBooking.status, "pending")))
    .returning({ id: seatBooking.id, status: seatBooking.status });
  if (!rejected) {
    throw new ApiError(409, "Esta solicitud ya no está disponible.", { code: "not_pending" });
  }
  return { booking: rejected };
}

export async function cancelOffer(
  database: Database,
  input: { offerId: string; userId: string; now?: Date },
) {
  const [offer] = await database
    .select({
      id: tripOffer.id,
      driverId: tripOffer.driverId,
      status: tripOffer.status,
      departureTime: tripOffer.departureTime,
      date: tripOffer.date,
      daysOfWeek: tripOffer.daysOfWeek,
    })
    .from(tripOffer)
    .where(eq(tripOffer.id, input.offerId))
    .limit(1);

  if (!offer) {
    throw new ApiError(404, "No encontramos este viaje.", { code: "offer_not_found" });
  }

  if (offer.driverId !== input.userId) {
    throw new ApiError(403, "No puedes gestionar este viaje.", { code: "driver_required" });
  }

  const now = input.now ?? new Date();
  const lateCancelled = isLateCancellation(offer.departureTime, offer.date, offer.daysOfWeek, now);

  if (offer.status === "cancelled") {
    return {
      offer: { id: offer.id, status: "cancelled" as const },
      lateCancelled,
      affectedBookings: [],
    };
  }

  const activeBookings = await database
    .select({
      id: seatBooking.id,
      requestId: seatBooking.requestId,
      passengerId: seatBooking.passengerId,
    })
    .from(seatBooking)
    .where(
      and(eq(seatBooking.offerId, offer.id), inArray(seatBooking.status, ["pending", "accepted"])),
    );

  await database
    .update(tripOffer)
    .set({ status: "cancelled", seatsTaken: 0, updatedAt: now })
    .where(eq(tripOffer.id, offer.id));

  if (activeBookings.length > 0) {
    await database
      .update(seatBooking)
      .set({ status: "cancelled_by_driver", updatedAt: now })
      .where(
        and(
          eq(seatBooking.offerId, offer.id),
          inArray(seatBooking.status, ["pending", "accepted"]),
        ),
      );

    const requestIds = activeBookings.map((b) => b.requestId).filter(Boolean);
    if (requestIds.length > 0) {
      await database
        .update(tripRequest)
        .set({ status: "open", updatedAt: now })
        .where(inArray(tripRequest.id, requestIds));
    }
  }

  return {
    offer: { id: offer.id, status: "cancelled" as const },
    lateCancelled,
    affectedBookings: activeBookings.map((b) => ({
      bookingId: b.id,
      passengerId: b.passengerId,
      status: "cancelled_by_driver" as const,
    })),
  };
}

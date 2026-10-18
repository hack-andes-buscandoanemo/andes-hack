import type { db as defaultDb } from "@andes-hack/db";
import { user as userTable } from "@andes-hack/db/schema/auth";
import { community, communityMember } from "@andes-hack/db/schema/community";
import { zone } from "@andes-hack/db/schema/places";
import { seatBooking, tripOffer, tripRequest } from "@andes-hack/db/schema/trips";
import { vehicle } from "@andes-hack/db/schema/vehicle";
import { places } from "@andes-hack/matching";
import { and, desc, eq, inArray } from "drizzle-orm";

import { destinationOf, matchOfferForNeed } from "./search";
import { ApiError } from "./utils/api-response";

type Database = typeof defaultDb;

async function loadOfferDetail(database: Database, input: { offerId: string; userId: string }) {
  const [row] = await database
    .select({
      id: tripOffer.id,
      communityId: tripOffer.communityId,
      driverId: tripOffer.driverId,
      communityName: community.name,
      destinationName: community.destinationName,
      originZoneName: zone.name,
      status: tripOffer.status,
      direction: tripOffer.direction,
      departureTime: tripOffer.departureTime,
      date: tripOffer.date,
      daysOfWeek: tripOffer.daysOfWeek,
      seatsTotal: tripOffer.seatsTotal,
      note: tripOffer.note,
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
    .select({ identifiesAsWoman: communityMember.identifiesAsWoman })
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
      status: seatBooking.status,
    })
    .from(seatBooking)
    .where(
      and(eq(seatBooking.offerId, row.id), inArray(seatBooking.status, ["pending", "accepted"])),
    );
  const isOwn = row.driverId === input.userId;
  const mine = bookings.find((booking) => booking.passengerId === input.userId);

  const destination = destinationOf(row);
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
    driverName: row.driverAlias ?? row.accountName,
    communityName: row.communityName,
    originZoneName: row.originZoneName,
    destinationName: destination.name,
    direction: row.direction,
    departureTime: row.departureTime,
    date: row.date,
    daysOfWeek: row.daysOfWeek,
    // Same count the engine and the search use: accepted passengers hold the seats.
    seatsFree: row.seatsTotal - bookings.filter((booking) => booking.status === "accepted").length,
    vehicle:
      row.make && row.model
        ? {
            make: row.make,
            model: row.model,
            // Never revealed once the trip is cancelled.
            plate:
              row.status !== "cancelled" && (isOwn || mine?.status === "accepted")
                ? row.plate
                : null,
          }
        : null,
    note: row.note,
    isOwn,
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
  };
  return { detail, need, match };
}

export async function getOfferDetail(
  database: Database,
  input: { offerId: string; userId: string },
) {
  return (await loadOfferDetail(database, input)).detail;
}

export async function requestSeat(
  database: Database,
  input: { offerId: string; userId: string; message?: string },
) {
  const { detail, match, need } = await loadOfferDetail(database, input);
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

export async function withdrawRequest(
  database: Database,
  input: { bookingId: string; userId: string },
) {
  const [mine] = await database
    .select({ id: seatBooking.id, status: seatBooking.status })
    .from(seatBooking)
    .where(and(eq(seatBooking.id, input.bookingId), eq(seatBooking.passengerId, input.userId)))
    .limit(1);
  if (!mine) {
    throw new ApiError(404, "No encontramos esta solicitud.", { code: "booking_not_found" });
  }
  // Withdrawing twice changes nothing.
  if (mine.status === "cancelled_by_passenger") return { booking: mine };
  // ponytail: releasing an accepted seat is US-022; here only a pending request can be withdrawn.
  if (mine.status !== "pending") {
    throw new ApiError(409, "Esta solicitud ya no se puede retirar.", { code: "not_withdrawable" });
  }
  const [booking] = await database
    .update(seatBooking)
    .set({ status: "cancelled_by_passenger" })
    .where(and(eq(seatBooking.id, mine.id), eq(seatBooking.status, "pending")))
    .returning({ id: seatBooking.id, status: seatBooking.status });
  return { booking: booking ?? { id: mine.id, status: "cancelled_by_passenger" as const } };
}

import type * as schema from "@andes-hack/db/schema/index";
import { communityMember } from "@andes-hack/db/schema/community";
import { matchRun, matchSuggestion } from "@andes-hack/db/schema/matching";
import { zone } from "@andes-hack/db/schema/places";
import { seatBooking, seatBookingDay, tripOffer, tripRequest } from "@andes-hack/db/schema/trips";
import {
  haversineKm,
  sources,
  type CommunityActivity,
  type OfferActivity,
} from "@andes-hack/matching";
import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alias } from "drizzle-orm/pg-core";

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export async function loadPublicComparison(db: Db, communityId: string) {
  const runs = await db
    .select()
    .from(matchRun)
    .where(eq(matchRun.communityId, communityId))
    .orderBy(desc(matchRun.createdAt));
  const baselineFor = (optimizer: typeof matchRun.$inferSelect) =>
    runs.find(
      (run) =>
        run.algorithm === "fcfs" &&
        run.date === optimizer.date &&
        run.direction === optimizer.direction &&
        run.createdAt <= optimizer.createdAt,
    );
  const optimizer = runs.find((run) => run.algorithm === "optimizer" && baselineFor(run));
  const fcfs = optimizer && baselineFor(optimizer);
  if (!optimizer || !fcfs) return null;
  const driver = alias(communityMember, "comparison_driver");
  const passenger = alias(communityMember, "comparison_passenger");
  const counts = async (runId: string) => {
    const suggestions = await db
      .select({ avoidsCarTrip: matchSuggestion.avoidsCarTrip })
      .from(matchSuggestion)
      .innerJoin(tripOffer, eq(tripOffer.id, matchSuggestion.offerId))
      .innerJoin(
        driver,
        and(eq(driver.userId, tripOffer.driverId), eq(driver.communityId, communityId)),
      )
      .innerJoin(
        passenger,
        and(
          eq(passenger.userId, matchSuggestion.passengerId),
          eq(passenger.communityId, communityId),
        ),
      )
      .where(
        and(
          eq(matchSuggestion.runId, runId),
          eq(tripOffer.communityId, communityId),
          eq(driver.isTeam, false),
          eq(passenger.isTeam, false),
        ),
      );
    return {
      carTripsAvoided: suggestions.filter((row) => row.avoidsCarTrip).length,
      passengersMatched: suggestions.length,
    };
  };
  return {
    date: optimizer.date,
    direction: optimizer.direction,
    optimizer: await counts(optimizer.id),
    firstComeFirstServed: await counts(fcfs.id),
  };
}

// Lima is UTC-5 all year; its calendar date tells whether a trip's day is over.
const limaToday = (now: Date) => new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);

// Reads a community's rows into the shape the US-030 metrics measure. It only reshapes
// rows: every figure is computed in @andes-hack/matching. With `only`, it keeps just one
// person's seats or offers, so the same metrics measure a profile (US-035).
export async function loadCommunityActivity(
  db: Db,
  community: { id: string; destinationLat: number; destinationLng: number },
  now: Date,
  only: { passengerId?: string; driverId?: string } = {},
): Promise<CommunityActivity> {
  const today = limaToday(now);
  const offerRows = await db
    .select({
      id: tripOffer.id,
      date: tripOffer.date,
      zoneLat: zone.lat,
      zoneLng: zone.lng,
      driverIsTeam: tripOffer.driverWasTeam,
      driverUsualMode: communityMember.usualMode,
    })
    .from(tripOffer)
    .innerJoin(zone, eq(zone.id, tripOffer.originZoneId))
    .leftJoin(
      communityMember,
      and(
        eq(communityMember.communityId, tripOffer.communityId),
        eq(communityMember.userId, tripOffer.driverId),
      ),
    )
    .where(
      and(
        eq(tripOffer.communityId, community.id),
        only.driverId ? eq(tripOffer.driverId, only.driverId) : undefined,
      ),
    );

  const seatRows = await db
    .select({
      id: seatBooking.id,
      offerId: seatBooking.offerId,
      status: seatBooking.status,
      detourMinutes: seatBooking.detourMinutes,
      fallbackMode: tripRequest.fallbackMode,
      zoneLat: zone.lat,
      zoneLng: zone.lng,
      passengerIsTeam: seatBooking.passengerWasTeam,
    })
    .from(seatBooking)
    .innerJoin(tripRequest, eq(tripRequest.id, seatBooking.requestId))
    .innerJoin(zone, eq(zone.id, tripRequest.originZoneId))
    .innerJoin(tripOffer, eq(tripOffer.id, seatBooking.offerId))
    .where(
      and(
        eq(tripOffer.communityId, community.id),
        only.passengerId ? eq(seatBooking.passengerId, only.passengerId) : undefined,
        only.driverId ? eq(tripOffer.driverId, only.driverId) : undefined,
      ),
    );

  const needRows = await db
    .select({ hadResults: tripRequest.hadResults, passengerIsTeam: communityMember.isTeam })
    .from(tripRequest)
    .leftJoin(
      communityMember,
      and(
        eq(communityMember.communityId, tripRequest.communityId),
        eq(communityMember.userId, tripRequest.passengerId),
      ),
    )
    .where(and(eq(tripRequest.communityId, community.id), eq(tripRequest.status, "open")));

  // A weekly seat is reused every week, so it counts once per day that ended (completed or
  // no-show, from seat_booking_day); a seat with no ended day yet counts once, as accepted.
  const closedDays = await db
    .select({
      bookingId: seatBookingDay.bookingId,
      tripDate: seatBookingDay.tripDate,
      outcome: seatBookingDay.outcome,
    })
    .from(seatBookingDay)
    .where(
      and(
        inArray(
          seatBookingDay.bookingId,
          seatRows.map((seat) => seat.id),
        ),
        isNotNull(seatBookingDay.outcome),
      ),
    );
  const statusesOf = (seat: (typeof seatRows)[number]) => {
    const ended = closedDays.filter((day) => day.bookingId === seat.id);
    return ended.length === 0
      ? [{ status: seat.status, ended: false, tripDate: null }]
      : ended.map((day) => ({ status: day.outcome!, ended: true, tripDate: day.tripDate }));
  };

  const offers: OfferActivity[] = offerRows.flatMap((offer) => {
    // An induced vehicle trip belongs to an occurrence, not to the reusable weekly offer.
    const occurrences = new Map<string, Array<OfferActivity["seats"][number]>>();
    for (const seat of seatRows.filter((seat) => seat.offerId === offer.id)) {
      for (const { status, ended, tripDate } of statusesOf(seat)) {
        const key = tripDate ?? offer.date ?? "planned";
        const seats = occurrences.get(key) ?? [];
        seats.push({
          status,
          fallbackMode: seat.fallbackMode,
          passengerIsTeam: seat.passengerIsTeam ?? false,
          datePassed: ended || (offer.date !== null && offer.date < today),
          distanceKm:
            haversineKm(
              { lat: seat.zoneLat, lng: seat.zoneLng },
              { lat: community.destinationLat, lng: community.destinationLng },
            ) * sources.circuityFactor.value,
          // Read detour minutes at free-flow speed to avoid overstating saved km.
          detourKm: (seat.detourMinutes / 60) * sources.freeFlowSpeed.value,
        });
        occurrences.set(key, seats);
      }
    }
    return [...occurrences.values()].map((seats) => ({
      driverUsualMode: offer.driverUsualMode,
      driverIsTeam: offer.driverIsTeam ?? false,
      seats,
    }));
  });

  return {
    offers,
    openNeeds: needRows.map((need) => ({
      passengerIsTeam: need.passengerIsTeam ?? false,
      hasCompatibleOffer: need.hadResults === true,
    })),
  };
}

// k-anonymity (US-029): a district with fewer people than this is not shown with its figure.
export const MIN_GROUP_SIZE = 10;

// How many different people travel from each district, through an active offer or an open
// need. A group under MIN_GROUP_SIZE comes back as null, so the exact count never leaves.
export async function loadDistrictBreakdown(db: Db, communityId: string) {
  const notTeam = or(isNull(communityMember.isTeam), eq(communityMember.isTeam, false));
  const drivers = await db
    .select({ district: zone.district, person: tripOffer.driverId })
    .from(tripOffer)
    .innerJoin(zone, eq(zone.id, tripOffer.originZoneId))
    .leftJoin(
      communityMember,
      and(
        eq(communityMember.communityId, tripOffer.communityId),
        eq(communityMember.userId, tripOffer.driverId),
      ),
    )
    .where(and(eq(tripOffer.communityId, communityId), eq(tripOffer.status, "active"), notTeam));
  const passengers = await db
    .select({ district: zone.district, person: tripRequest.passengerId })
    .from(tripRequest)
    .innerJoin(zone, eq(zone.id, tripRequest.originZoneId))
    .leftJoin(
      communityMember,
      and(
        eq(communityMember.communityId, tripRequest.communityId),
        eq(communityMember.userId, tripRequest.passengerId),
      ),
    )
    .where(and(eq(tripRequest.communityId, communityId), eq(tripRequest.status, "open"), notTeam));

  const peopleByDistrict = new Map<string, Set<string>>();
  for (const { district, person } of [...drivers, ...passengers]) {
    if (person === null) continue;
    peopleByDistrict.set(district, (peopleByDistrict.get(district) ?? new Set()).add(person));
  }
  return [...peopleByDistrict]
    .map(([district, people]) => ({
      district,
      people: people.size >= MIN_GROUP_SIZE ? people.size : null,
    }))
    .toSorted((a, b) => a.district.localeCompare(b.district, "es"));
}

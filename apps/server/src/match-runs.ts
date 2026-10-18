import type { RunMatchingBodySchema } from "@andes-hack/api";
import type { db as defaultDb } from "@andes-hack/db";
import { user as userTable } from "@andes-hack/db/schema/auth";
import { community, communityMember } from "@andes-hack/db/schema/community";
import { matchRun, matchSuggestion } from "@andes-hack/db/schema/matching";
import { seatBooking, tripOffer, tripRequest } from "@andes-hack/db/schema/trips";
import {
  compareStrategies,
  createTravelTimeModel,
  type DayPlan,
  type DayRequest,
  places,
  type StrategyReport,
} from "@andes-hack/matching";
import { and, desc, eq, inArray, isNull, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";

import type { JourneyLock } from "./lib/journey-lock";
import { logEvent } from "./lib/logger";
import { destinationOf, loadOfferRoutes } from "./search";
import { ApiError } from "./utils/api-response";

type Database = typeof defaultDb;
type Journey = z.infer<typeof RunMatchingBodySchema>;

const model = createTravelTimeModel();

const meetingPointNames = new Map(places.meetingPoints.map((point) => [point.id, point.name]));

// ISO weekday of a calendar date: 1 = Monday … 7 = Sunday.
function isoWeekday(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
}

// Only an admin of the community runs or reads its matching.
async function requireAdmin(database: Database, communityId: string, userId: string) {
  const [org] = await database
    .select({ id: community.id, destinationName: community.destinationName })
    .from(community)
    .where(eq(community.id, communityId))
    .limit(1);
  if (!org) {
    throw new ApiError(404, "Comunidad no encontrada.", { code: "community_not_found" });
  }
  const [membership] = await database
    .select({ role: communityMember.role })
    .from(communityMember)
    .where(and(eq(communityMember.communityId, communityId), eq(communityMember.userId, userId)))
    .limit(1);
  if (!membership) {
    throw new ApiError(403, "No perteneces a esta comunidad.", {
      code: "community_membership_required",
    });
  }
  if (membership.role !== "admin") {
    throw new ApiError(403, "Solo un administrador puede ejecutar el emparejamiento.", {
      code: "admin_required",
    });
  }
  return org;
}

// The offers and open needs that travel on the journey's date, as the engine reads them.
async function loadJourney(
  database: Database,
  input: { communityId: string; destination: { id: string } } & Journey,
) {
  const { communityId, direction, date } = input;
  const onDate = (table: typeof tripOffer | typeof tripRequest) =>
    or(
      eq(table.date, date),
      and(isNull(table.date), sql`${isoWeekday(date)} = ANY(${table.daysOfWeek})`),
    );
  const { rows: offers, routes } = await loadOfferRoutes(database, {
    communityId,
    destination: input.destination,
    where: and(
      eq(tripOffer.communityId, communityId),
      eq(tripOffer.direction, direction),
      eq(tripOffer.status, "active"),
      onDate(tripOffer),
    ),
  });

  // Whoever the driver already accepted rides in the route's passengers, not as a need.
  const needs = await database
    .select({
      id: tripRequest.id,
      passengerId: tripRequest.passengerId,
      originZoneId: tripRequest.originZoneId,
      windowStart: tripRequest.windowStart,
      windowEnd: tripRequest.windowEnd,
      maxWalkMinutes: tripRequest.maxWalkMinutes,
      fallbackMode: tripRequest.fallbackMode,
      passengerName: communityMember.alias,
      accountName: userTable.name,
      passengerIsWoman: communityMember.identifiesAsWoman,
    })
    .from(tripRequest)
    .innerJoin(userTable, eq(tripRequest.passengerId, userTable.id))
    .innerJoin(
      communityMember,
      and(
        eq(communityMember.userId, tripRequest.passengerId),
        eq(communityMember.communityId, tripRequest.communityId),
      ),
    )
    .where(
      and(
        eq(tripRequest.communityId, communityId),
        eq(tripRequest.direction, direction),
        eq(tripRequest.status, "open"),
        onDate(tripRequest),
        notExists(
          database
            .select({ id: seatBooking.id })
            .from(seatBooking)
            .where(
              and(eq(seatBooking.requestId, tripRequest.id), eq(seatBooking.status, "accepted")),
            ),
        ),
      ),
    )
    .orderBy(tripRequest.createdAt);

  const requests: DayRequest[] = needs.map((need) => ({
    id: need.id,
    passengerId: need.passengerId!,
    communityId,
    direction,
    originZoneId: need.originZoneId,
    windowStart: need.windowStart.slice(0, 5),
    windowEnd: need.windowEnd.slice(0, 5),
    // Every need is pinned to the journey's date; the offer's schedule still has to cover it.
    date,
    daysOfWeek: null,
    maxWalkMinutes: need.maxWalkMinutes,
    // ponytail: the saved need does not store the "Solo mujeres" preference; the offer's own flag still applies.
    womenOnly: false,
    passengerIsWoman: need.passengerIsWoman,
    fallbackMode: need.fallbackMode,
  }));
  return { offers, routes, needs, requests };
}

const journeyKey = ({ communityId, direction, date }: Journey & { communityId: string }) =>
  `match-run:${communityId}:${direction}:${date}`;

function metricsOf(plan: DayPlan) {
  return { ...plan.objective, unassigned: plan.unassigned.length };
}

type MatchRunRow = typeof matchRun.$inferSelect;

function summaryOf(run: MatchRunRow) {
  return {
    id: run.id,
    ...run.metrics,
    ...run.inputSummary,
    durationMs: run.durationMs,
    createdAt: run.createdAt.toISOString(),
  };
}

// A journey's two runs as the panel shows them, with the optimizer's recommendations named.
async function describeJourney(
  database: Database,
  runs: { optimizer: MatchRunRow; firstComeFirstServed: MatchRunRow },
) {
  const driverMember = alias(communityMember, "driver_member");
  const driverAccount = alias(userTable, "driver_account");
  const passengerMember = alias(communityMember, "passenger_member");
  const passengerAccount = alias(userTable, "passenger_account");
  const rows = await database
    .select({
      id: matchSuggestion.id,
      offerId: matchSuggestion.offerId,
      driverName: driverMember.alias,
      driverAccountName: driverAccount.name,
      requestId: matchSuggestion.requestId,
      passengerName: passengerMember.alias,
      passengerAccountName: passengerAccount.name,
      meetingPointId: matchSuggestion.meetingPointId,
      pickupAt: matchSuggestion.pickupAt,
      arrivalAt: matchSuggestion.arrivalAt,
      detourMinutes: matchSuggestion.detourMinutes,
      walkMinutes: matchSuggestion.walkMinutes,
      avoidsCarTrip: matchSuggestion.avoidsCarTrip,
      status: matchSuggestion.status,
    })
    .from(matchSuggestion)
    .innerJoin(tripOffer, eq(matchSuggestion.offerId, tripOffer.id))
    .leftJoin(driverAccount, eq(tripOffer.driverId, driverAccount.id))
    .leftJoin(
      driverMember,
      and(
        eq(driverMember.userId, tripOffer.driverId),
        eq(driverMember.communityId, tripOffer.communityId),
      ),
    )
    .leftJoin(passengerAccount, eq(matchSuggestion.passengerId, passengerAccount.id))
    .leftJoin(
      passengerMember,
      and(
        eq(passengerMember.userId, matchSuggestion.passengerId),
        eq(passengerMember.communityId, tripOffer.communityId),
      ),
    )
    .where(eq(matchSuggestion.runId, runs.optimizer.id))
    .orderBy(matchSuggestion.pickupAt, matchSuggestion.id);
  return {
    direction: runs.optimizer.direction,
    date: runs.optimizer.date,
    optimizer: summaryOf(runs.optimizer),
    firstComeFirstServed: summaryOf(runs.firstComeFirstServed),
    suggestions: rows.map((row) => ({
      id: row.id,
      offerId: row.offerId,
      // A deleted account leaves no name (US-029).
      driverName: row.driverName ?? row.driverAccountName ?? "Conductor",
      requestId: row.requestId,
      passengerName: row.passengerName ?? row.passengerAccountName ?? "Pasajero",
      meetingPointName: meetingPointNames.get(row.meetingPointId) ?? row.meetingPointId,
      pickupAt: row.pickupAt.slice(0, 5),
      arrivalAt: row.arrivalAt.slice(0, 5),
      detourMinutes: row.detourMinutes,
      walkMinutes: row.walkMinutes,
      avoidsCarTrip: row.avoidsCarTrip,
      status: row.status,
    })),
  };
}

// The optimizer's recommendations for one person that are still open: no run replaced
// them, and the person has no active request on that trip yet.
export async function listProposals(
  database: Database,
  input: { communityId: string; userId: string },
) {
  const { communityId, userId } = input;
  const [membership] = await database
    .select({ id: communityMember.id })
    .from(communityMember)
    .where(and(eq(communityMember.communityId, communityId), eq(communityMember.userId, userId)))
    .limit(1);
  if (!membership) {
    throw new ApiError(403, "No perteneces a esta comunidad.", {
      code: "community_membership_required",
    });
  }
  const driverMember = alias(communityMember, "driver_member");
  const driverAccount = alias(userTable, "driver_account");
  const rows = await database
    .select({
      suggestionId: matchSuggestion.id,
      offerId: matchSuggestion.offerId,
      driverName: driverMember.alias,
      driverAccountName: driverAccount.name,
      direction: matchRun.direction,
      date: matchRun.date,
      meetingPointId: matchSuggestion.meetingPointId,
      pickupAt: matchSuggestion.pickupAt,
      arrivalAt: matchSuggestion.arrivalAt,
      walkMinutes: matchSuggestion.walkMinutes,
    })
    .from(matchSuggestion)
    .innerJoin(matchRun, eq(matchSuggestion.runId, matchRun.id))
    .innerJoin(tripOffer, eq(matchSuggestion.offerId, tripOffer.id))
    .leftJoin(driverAccount, eq(tripOffer.driverId, driverAccount.id))
    .leftJoin(
      driverMember,
      and(
        eq(driverMember.userId, tripOffer.driverId),
        eq(driverMember.communityId, tripOffer.communityId),
      ),
    )
    .where(
      and(
        eq(matchRun.communityId, communityId),
        eq(matchRun.algorithm, "optimizer"),
        eq(matchSuggestion.passengerId, userId),
        eq(matchSuggestion.status, "proposed"),
        eq(tripOffer.status, "active"),
        notExists(
          database
            .select({ id: seatBooking.id })
            .from(seatBooking)
            .where(
              and(
                eq(seatBooking.offerId, matchSuggestion.offerId),
                eq(seatBooking.passengerId, userId),
                inArray(seatBooking.status, ["pending", "accepted"]),
              ),
            ),
        ),
      ),
    )
    .orderBy(matchRun.date, matchSuggestion.pickupAt);
  return {
    proposals: rows.map((row) => ({
      suggestionId: row.suggestionId,
      offerId: row.offerId,
      driverName: row.driverName ?? row.driverAccountName ?? "Conductor",
      direction: row.direction,
      date: row.date,
      meetingPointName: meetingPointNames.get(row.meetingPointId) ?? row.meetingPointId,
      pickupAt: row.pickupAt.slice(0, 5),
      arrivalAt: row.arrivalAt.slice(0, 5),
      walkMinutes: row.walkMinutes,
    })),
  };
}

export async function latestMatchRuns(
  database: Database,
  input: { communityId: string; userId: string },
) {
  const { communityId, userId } = input;
  await requireAdmin(database, communityId, userId);
  const [optimizer] = await database
    .select()
    .from(matchRun)
    .where(and(eq(matchRun.communityId, communityId), eq(matchRun.algorithm, "optimizer")))
    .orderBy(desc(matchRun.createdAt))
    .limit(1);
  if (!optimizer) {
    throw new ApiError(404, "Todavía no se ejecutó ningún emparejamiento.", {
      code: "no_match_runs",
    });
  }
  // The baseline saved right before it, on the same journey.
  const [firstComeFirstServed] = await database
    .select()
    .from(matchRun)
    .where(
      and(
        eq(matchRun.communityId, communityId),
        eq(matchRun.direction, optimizer.direction),
        eq(matchRun.date, optimizer.date),
        eq(matchRun.algorithm, "fcfs"),
      ),
    )
    .orderBy(desc(matchRun.createdAt))
    .limit(1);
  return describeJourney(database, { optimizer, firstComeFirstServed: firstComeFirstServed! });
}

export async function runMatching(
  database: Database,
  input: { communityId: string; userId: string; body: Journey; lock: JourneyLock },
) {
  const { communityId, userId, body, lock } = input;
  const org = await requireAdmin(database, communityId, userId);
  const destination = destinationOf(org);

  const key = journeyKey({ communityId, ...body });
  if (!(await lock.acquire(key))) {
    throw new ApiError(409, "Ya hay un emparejamiento en curso para esta jornada.", {
      code: "match_run_in_progress",
    });
  }
  try {
    const journey = await loadJourney(database, { communityId, destination, ...body });
    if (journey.routes.length === 0 && journey.requests.length === 0) {
      throw new ApiError(409, "No hay ofertas ni necesidades para esta jornada.", {
        code: "no_journey_inputs",
      });
    }
    const comparison = compareStrategies(
      { date: body.date, offers: journey.routes, requests: journey.requests },
      model,
    );

    // Earlier recommendations for this journey give way; a seat the driver already accepted stays.
    const earlierRuns = database
      .select({ id: matchRun.id })
      .from(matchRun)
      .where(
        and(
          eq(matchRun.communityId, communityId),
          eq(matchRun.direction, body.direction),
          eq(matchRun.date, body.date),
        ),
      );
    await database
      .delete(matchSuggestion)
      .where(
        and(inArray(matchSuggestion.runId, earlierRuns), eq(matchSuggestion.status, "proposed")),
      );

    const save = async (algorithm: "fcfs" | "optimizer", report: StrategyReport) => {
      const [run] = await database
        .insert(matchRun)
        .values({
          communityId,
          direction: body.direction,
          date: body.date,
          algorithm,
          inputSummary: { offers: journey.routes.length, requests: journey.requests.length },
          metrics: metricsOf(report.plan),
          durationMs: Math.round(report.durationMs),
          runBy: userId,
        })
        .returning();
      const { assignments } = report.plan;
      if (assignments.length > 0) {
        await database.insert(matchSuggestion).values(
          assignments.map((assignment) => ({
            runId: run!.id,
            offerId: assignment.offerId,
            requestId: assignment.requestId,
            passengerId: assignment.passengerId,
            meetingPointId: assignment.meetingPointId,
            position: assignment.position,
            pickupAt: assignment.pickupAt,
            arrivalAt: assignment.arrivalAt,
            detourMinutes: assignment.detourMinutes,
            walkMinutes: assignment.walkMinutes,
            avoidsCarTrip: assignment.avoidsCarTrip,
          })),
        );
      }
      return run!;
    };
    const fcfs = await save("fcfs", comparison.firstComeFirstServed);
    const optimizer = await save("optimizer", comparison.optimizer);

    logEvent("match_run.completed", {
      communityId,
      direction: body.direction,
      date: body.date,
      offers: journey.routes.length,
      requests: journey.requests.length,
      carTripsAvoided: comparison.optimizer.carTripsAvoided,
    });

    return describeJourney(database, { optimizer, firstComeFirstServed: fcfs });
  } finally {
    await lock.release(key);
  }
}

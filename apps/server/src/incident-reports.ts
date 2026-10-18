import {
  createIncidentReportRoute,
  listCommunityIncidentReportsRoute,
  reviewIncidentReportRoute,
} from "@andes-hack/api";
import { db as defaultDb } from "@andes-hack/db";
import { user as userTable } from "@andes-hack/db/schema/auth";
import { communityMember } from "@andes-hack/db/schema/community";
import { incidentReport } from "@andes-hack/db/schema/incident-report";
import { seatBooking, tripMessage, tripOffer } from "@andes-hack/db/schema/trips";
import { and, desc, eq, inArray } from "drizzle-orm";
import { OpenAPIHono } from "@hono/zod-openapi";

import { ApiError } from "./utils/api-response";
import { errorHandler, validationHook } from "./utils/error-handler";

type IncidentReportDeps = {
  db?: typeof defaultDb;
  now?: () => Date;
};

export function createIncidentReportRoutes(deps: IncidentReportDeps = {}) {
  const app = new OpenAPIHono({ defaultHook: validationHook });
  app.onError(errorHandler);

  const database = deps.db ?? defaultDb;
  const getNow = deps.now ?? (() => new Date());

  app.openapi(createIncidentReportRoute, async (c) => {
    const { offerId, type, description, reportedUserId, messageId } = c.req.valid("json");
    const userId = (c.get("user") as { id: string }).id;
    const [offer] = await database
      .select({
        id: tripOffer.id,
        communityId: tripOffer.communityId,
        driverId: tripOffer.driverId,
      })
      .from(tripOffer)
      .where(eq(tripOffer.id, offerId))
      .limit(1);

    if (!offer) {
      throw new ApiError(404, "Viaje no encontrado.", { code: "offer_not_found" });
    }
    if (offer.driverId !== userId) {
      const [booking] = await database
        .select({ id: seatBooking.id })
        .from(seatBooking)
        .where(
          and(
            eq(seatBooking.offerId, offer.id),
            eq(seatBooking.passengerId, userId),
            inArray(seatBooking.status, ["accepted", "completed", "no_show"]),
          ),
        )
        .limit(1);
      if (!booking) {
        throw new ApiError(403, "Debes haber participado en el viaje para reportar un incidente.", {
          code: "incident_report_participation_required",
        });
      }
    }

    let targetId = reportedUserId ?? null;
    if (messageId) {
      const [message] = await database
        .select({ senderId: tripMessage.senderId })
        .from(tripMessage)
        .where(and(eq(tripMessage.id, messageId), eq(tripMessage.offerId, offer.id)))
        .limit(1);
      if (!message || (targetId && targetId !== message.senderId)) {
        throw new ApiError(422, "El mensaje reportado no corresponde a este viaje.", {
          code: "incident_report_message_invalid",
        });
      }
      targetId = message.senderId;
    }
    if (targetId) {
      const [targetBooking] = await database
        .select({ id: seatBooking.id })
        .from(seatBooking)
        .where(
          and(
            eq(seatBooking.offerId, offer.id),
            eq(seatBooking.passengerId, targetId),
            inArray(seatBooking.status, ["accepted", "completed", "no_show"]),
          ),
        )
        .limit(1);
      if (targetId === userId || (offer.driverId !== targetId && !targetBooking)) {
        throw new ApiError(422, "La persona reportada debe haber participado en el viaje.", {
          code: "incident_report_target_invalid",
        });
      }
    }

    const [report] = await database
      .insert(incidentReport)
      .values({
        communityId: offer.communityId,
        offerId: offer.id,
        reporterId: userId,
        reportedUserId: targetId,
        messageId,
        type,
        description,
        createdAt: getNow(),
      })
      .returning({
        id: incidentReport.id,
        status: incidentReport.status,
        createdAt: incidentReport.createdAt,
      });

    return c.json({ success: true, status: 201 as const, data: report! }, 201);
  });

  app.openapi(listCommunityIncidentReportsRoute, async (c) => {
    const { id: communityId } = c.req.valid("param");
    const userId = (c.get("user") as { id: string }).id;
    const [membership] = await database
      .select({ role: communityMember.role })
      .from(communityMember)
      .where(and(eq(communityMember.communityId, communityId), eq(communityMember.userId, userId)))
      .limit(1);
    if (membership?.role !== "admin") {
      throw new ApiError(403, "Solo los administradores de la comunidad pueden ver los reportes.", {
        code: "admin_required",
      });
    }

    const reports = await database
      .select({
        id: incidentReport.id,
        offerId: incidentReport.offerId,
        reportedUserId: incidentReport.reportedUserId,
        reportedUserName: userTable.name,
        messageId: incidentReport.messageId,
        type: incidentReport.type,
        description: incidentReport.description,
        status: incidentReport.status,
        createdAt: incidentReport.createdAt,
      })
      .from(incidentReport)
      .leftJoin(userTable, eq(incidentReport.reportedUserId, userTable.id))
      .where(eq(incidentReport.communityId, communityId))
      .orderBy(desc(incidentReport.createdAt));
    return c.json({ reports }, 200);
  });

  app.openapi(reviewIncidentReportRoute, async (c) => {
    const { id } = c.req.valid("param");
    const [report] = await database
      .select({ communityId: incidentReport.communityId })
      .from(incidentReport)
      .where(eq(incidentReport.id, id))
      .limit(1);
    if (!report) {
      throw new ApiError(404, "Reporte no encontrado.", { code: "incident_report_not_found" });
    }

    const userId = (c.get("user") as { id: string }).id;
    const [membership] = await database
      .select({ role: communityMember.role })
      .from(communityMember)
      .where(
        and(
          eq(communityMember.communityId, report.communityId),
          eq(communityMember.userId, userId),
        ),
      )
      .limit(1);
    if (membership?.role !== "admin") {
      throw new ApiError(403, "Solo un administrador de la comunidad puede revisar el reporte.", {
        code: "admin_required",
      });
    }

    const [updated] = await database
      .update(incidentReport)
      .set({ status: "reviewed" })
      .where(eq(incidentReport.id, id))
      .returning({ id: incidentReport.id, status: incidentReport.status });
    if (!updated) {
      throw new ApiError(404, "Reporte no encontrado.", { code: "incident_report_not_found" });
    }
    return c.json({ id: updated.id, status: "reviewed" as const }, 200);
  });

  return app;
}

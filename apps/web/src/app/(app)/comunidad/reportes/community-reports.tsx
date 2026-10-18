"use client";

import { useEffect, useState } from "react";

import { communitiesApi, type IncidentReport } from "@/lib/communities-api";
import { Button } from "@/components/ui/button";

const incidentLabels: Record<IncidentReport["type"], string> = {
  harassment: "Acoso",
  dangerous_driving: "Conducción riesgosa",
  no_show: "No se presentó",
  inappropriate_behavior: "Comportamiento inadecuado",
  other: "Otro",
};

export default function CommunityReports({ communityId }: { communityId: string }) {
  const [reports, setReports] = useState<IncidentReport[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reviewError, setReviewError] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    communitiesApi
      .listCommunityIncidentReports(communityId)
      .then(({ reports: loaded }) => {
        if (active) setReports(loaded);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [communityId]);

  async function markReviewed(id: string) {
    if (reviewingId) return;
    setReviewingId(id);
    setReviewError(false);
    try {
      const updated = await communitiesApi.reviewIncidentReport(id);
      setReports(
        (current) =>
          current?.map((report) =>
            report.id === id ? { ...report, status: updated.status } : report,
          ) ?? null,
      );
    } catch {
      setReviewError(true);
    } finally {
      setReviewingId(null);
    }
  }

  if (loadError) {
    return <p role="alert">No pudimos cargar los reportes. Inténtalo de nuevo.</p>;
  }
  if (!reports) return <p role="status">Cargando reportes…</p>;
  if (reports.length === 0) return <p>No hay reportes en esta comunidad.</p>;

  return (
    <div className="space-y-3">
      {reports.map((report) => (
        <article key={report.id} className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold">{incidentLabels[report.type]}</h3>
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold">
              {report.status === "open" ? "Abierto" : "Revisado"}
            </span>
          </div>
          <p className="text-sm">
            Persona reportada: {report.reportedUserName ?? "No especificada"}
          </p>
          {report.description ? <p className="text-sm">{report.description}</p> : null}
          <time dateTime={report.createdAt} className="block text-xs text-muted-foreground">
            {new Date(report.createdAt).toLocaleString("es-PE", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "America/Lima",
            })}
          </time>
          {report.status === "open" ? (
            <Button
              type="button"
              variant="outline"
              disabled={reviewingId !== null}
              onClick={() => void markReviewed(report.id)}
            >
              {reviewingId === report.id ? "Guardando…" : "Marcar como revisado"}
            </Button>
          ) : null}
        </article>
      ))}
      {reviewError ? (
        <p role="alert">No pudimos marcar el reporte como revisado. Inténtalo de nuevo.</p>
      ) : null}
    </div>
  );
}

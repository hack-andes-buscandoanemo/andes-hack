"use client";

import { useState } from "react";

import { communitiesApi, type CreateIncidentReportRequest } from "@/lib/communities-api";

import { Button } from "./ui/button";

const incidentTypes = [
  ["harassment", "Acoso"],
  ["dangerous_driving", "Conducción riesgosa"],
  ["no_show", "No se presentó"],
  ["inappropriate_behavior", "Comportamiento inadecuado"],
  ["other", "Otro"],
] as const;

type ReportedPerson = { id: string; name: string };

export default function IncidentReportForm({
  offerId,
  messageId,
  reportedUsers,
  onCancel,
}: {
  offerId: string;
  messageId?: string;
  reportedUsers?: ReportedPerson[];
  onCancel?: () => void;
}) {
  const [type, setType] = useState<CreateIncidentReportRequest["type"]>("other");
  const [description, setDescription] = useState("");
  const [reportedUserId, setReportedUserId] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setResult(null);
    try {
      await communitiesApi.createIncidentReport({
        offerId,
        type,
        description: description.trim() || undefined,
        reportedUserId: reportedUserId || undefined,
        messageId,
      });
      setResult("success");
    } catch {
      setResult("error");
    } finally {
      setSending(false);
    }
  }

  if (result === "success") {
    return (
      <p role="status" className="rounded-xl border bg-card p-3 text-sm font-medium">
        Recibimos tu reporte. Tu identidad no se comparte con la persona reportada.
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm"
    >
      <label className="block space-y-1 text-sm font-medium">
        Tipo
        <select
          value={type}
          onChange={(event) => setType(event.target.value as CreateIncidentReportRequest["type"])}
          className="field"
        >
          {incidentTypes.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {reportedUsers?.length ? (
        <label className="block space-y-1 text-sm font-medium">
          Persona reportada (opcional)
          <select
            value={reportedUserId}
            onChange={(event) => setReportedUserId(event.target.value)}
            className="field"
          >
            <option value="">No especificar</option>
            {reportedUsers.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block space-y-1 text-sm font-medium">
        Describe lo que pasó (opcional, máximo 1000 caracteres)
        <textarea
          value={description}
          maxLength={1000}
          onChange={(event) => setDescription(event.target.value)}
          className="field font-normal"
        />
      </label>
      <p className="text-sm text-muted-foreground">
        Si estás en peligro, llama al 105 (Policía Nacional).
      </p>
      {result === "error" ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          No pudimos enviar tu reporte. Inténtalo de nuevo.
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={sending} className="flex-1">
          {sending ? "Enviando…" : "Enviar reporte"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={sending}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}

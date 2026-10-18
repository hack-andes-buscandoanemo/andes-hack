// Every constant the engine uses, with where it comes from. `dato` has a verifiable
// source; `estimado` is an assumption of the team. /datos (US-032) shows this table.

export type SourceKind = "dato" | "estimado";

export interface Source {
  label: string;
  value: number;
  unit: string;
  kind: SourceKind;
  source: string;
  date: string;
}

const tomtom =
  "TomTom Traffic Index 2025, Lima, curva de lunes a viernes (https://www.tomtom.com/traffic-index/city/lima/)";

export const sources = {
  weekdayFactorAt7: {
    label: "Factor de tráfico, día laborable, 7:00",
    value: 1.72,
    unit: "× flujo libre",
    kind: "dato",
    source: tomtom,
    date: "2026-10-17",
  },
  weekdayFactorAt8: {
    label: "Factor de tráfico, día laborable, 8:00",
    value: 2.01,
    unit: "× flujo libre",
    kind: "dato",
    source: tomtom,
    date: "2026-10-17",
  },
  weekdayFactorAt9: {
    label: "Factor de tráfico, día laborable, 9:00",
    value: 1.92,
    unit: "× flujo libre",
    kind: "dato",
    source: tomtom,
    date: "2026-10-17",
  },
  weekdayFactorAt18: {
    label: "Factor de tráfico, día laborable, 18:00",
    value: 2.31,
    unit: "× flujo libre",
    kind: "dato",
    source: tomtom,
    date: "2026-10-17",
  },
  nightFactor: {
    label: "Factor de tráfico de 23:00 a 4:59",
    value: 1,
    unit: "× flujo libre",
    kind: "estimado",
    source:
      "Supuesto del equipo: de madrugada se circula a flujo libre. Las horas entre este tramo y los datos de TomTom se interpolan linealmente.",
    date: "2026-10-17",
  },
  weekendFactor: {
    label: "Factor de tráfico, sábado y domingo, todo el día",
    value: 1.3,
    unit: "× flujo libre",
    kind: "estimado",
    source:
      "Supuesto del equipo: el fin de semana hay menos tráfico que en hora punta laborable. No tenemos la curva de TomTom para el fin de semana.",
    date: "2026-10-17",
  },
} as const satisfies Record<string, Source>;

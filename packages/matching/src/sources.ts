// Every constant the engine uses, with where it comes from. `dato` has a verifiable
// source; `estimado` is an assumption of the team. /datos (US-032) shows this table.

export type SourceKind = "dato" | "estimado";

export interface Source {
  label: string;
  // A rule rather than a number, like the interpolation, is written as text.
  value: number | string;
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
    source: "Supuesto del equipo: de madrugada se circula a flujo libre.",
    date: "2026-10-17",
  },
  weekdayInterpolation: {
    label:
      "Factor de tráfico, día laborable, horas sin dato de TomTom (5:00 a 6:59, 10:00 a 17:59 y 19:00 a 22:59)",
    value: "interpolación lineal",
    unit: "entre las dos horas vecinas con factor",
    kind: "estimado",
    source:
      "Supuesto del equipo: entre dos horas con factor conocido (TomTom o el flujo libre de madrugada) el tráfico cambia en línea recta.",
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
  circuityFactor: {
    label: "Factor de rodeo (km por calle ÷ km en línea recta)",
    value: 1.29,
    unit: "×",
    kind: "estimado",
    source:
      "Mediana sobre los pares a más de 1 km de la matriz OSRM (© OpenStreetMap, ODbL), calculada por scripts/build-travel-matrix.ts",
    date: "2026-10-17",
  },
  walkingSpeed: {
    label: "Velocidad a pie",
    value: 4.5,
    unit: "km/h",
    kind: "estimado",
    source:
      "Supuesto del equipo: paso urbano de un adulto. La caminata se mide en línea recta × el factor de rodeo.",
    date: "2026-10-17",
  },
  freeFlowSpeed: {
    label: "Velocidad en auto a flujo libre, para pares sin dato en la matriz",
    value: 42.5,
    unit: "km/h",
    kind: "estimado",
    source:
      "Mediana sobre los pares a más de 1 km de la matriz OSRM (© OpenStreetMap, ODbL), calculada por scripts/build-travel-matrix.ts",
    date: "2026-10-17",
  },
  fuelEconomy: {
    label: "Rendimiento de un auto a gasolina, para el CO₂ evitado",
    value: 35,
    unit: "km por galón",
    kind: "estimado",
    source:
      "Supuesto del equipo: un auto particular a gasolina en Lima. Convierte los km evitados en galones no quemados.",
    date: "2026-10-17",
  },
  gasolineCo2: {
    label: "CO₂ que emite un galón de gasolina",
    value: 8.887,
    unit: "kg de CO₂ por galón",
    kind: "dato",
    source:
      "EPA, Greenhouse Gas Emissions from a Typical Passenger Vehicle: 8887 g de CO₂ por galón (https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle)",
    date: "2026-10-17",
  },
} as const satisfies Record<string, Source>;

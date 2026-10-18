import { travelMatrix } from "./travel-matrix";

// Every constant the engine uses, and every figure the app compares it with, with where it
// comes from. `dato` has a verifiable source at `url`; `estimado` is an assumption of the
// team. /datos (US-032) shows this table through GET /public/data-sources.

export type SourceKind = "dato" | "estimado";

// The section of /datos a constant belongs to, so an estimated figure can link to it.
export type SourceTopic = "tiempos" | "impacto" | "contexto";

export interface Source {
  label: string;
  // A rule rather than a number, like the interpolation, is written as text.
  value: number | string;
  unit: string;
  kind: SourceKind;
  topic: SourceTopic;
  source: string;
  // Where anyone can check a `dato`; an assumption of the team has none.
  url: string | null;
  date: string;
}

const tomtom = "TomTom Traffic Index 2025, Lima, curva de lunes a viernes";
const tomtomUrl = "https://www.tomtom.com/traffic-index/city/lima/";

const gasolinePrices = "Facilito (Osinergmin), vía Infobae, 17 de octubre de 2026";
const gasolinePricesUrl =
  "https://www.infobae.com/peru/2026/10/17/consulta-en-este-link-el-precio-de-la-gasolina-mas-barata-y-cara-en-lima-hoy-17-de-octubre/";

export const sources = {
  weekdayFactorAt7: {
    label: "Factor de tráfico, día laborable, 7:00",
    value: 1.72,
    unit: "× flujo libre",
    kind: "dato",
    topic: "tiempos",
    source: tomtom,
    url: tomtomUrl,
    date: "2026-10-17",
  },
  weekdayFactorAt8: {
    label: "Factor de tráfico, día laborable, 8:00",
    value: 2.01,
    unit: "× flujo libre",
    kind: "dato",
    topic: "tiempos",
    source: tomtom,
    url: tomtomUrl,
    date: "2026-10-17",
  },
  weekdayFactorAt9: {
    label: "Factor de tráfico, día laborable, 9:00",
    value: 1.92,
    unit: "× flujo libre",
    kind: "dato",
    topic: "tiempos",
    source: tomtom,
    url: tomtomUrl,
    date: "2026-10-17",
  },
  weekdayFactorAt18: {
    label: "Factor de tráfico, día laborable, 18:00",
    value: 2.31,
    unit: "× flujo libre",
    kind: "dato",
    topic: "tiempos",
    source: tomtom,
    url: tomtomUrl,
    date: "2026-10-17",
  },
  nightFactor: {
    label: "Factor de tráfico de 23:00 a 4:59",
    value: 1,
    unit: "× flujo libre",
    kind: "estimado",
    topic: "tiempos",
    source: "Supuesto del equipo: de madrugada se circula a flujo libre.",
    url: null,
    date: "2026-10-17",
  },
  weekdayInterpolation: {
    label:
      "Factor de tráfico, día laborable, horas sin dato de TomTom (5:00 a 6:59, 10:00 a 17:59 y 19:00 a 22:59)",
    value: "interpolación lineal",
    unit: "entre las dos horas vecinas con factor",
    kind: "estimado",
    topic: "tiempos",
    source:
      "Supuesto del equipo: entre dos horas con factor conocido (TomTom o el flujo libre de madrugada) el tráfico cambia en línea recta.",
    url: null,
    date: "2026-10-17",
  },
  weekendFactor: {
    label: "Factor de tráfico, sábado y domingo, todo el día",
    value: 1.3,
    unit: "× flujo libre",
    kind: "estimado",
    topic: "tiempos",
    source:
      "Supuesto del equipo: el fin de semana hay menos tráfico que en hora punta laborable. No tenemos la curva de TomTom para el fin de semana.",
    url: null,
    date: "2026-10-17",
  },
  circuityFactor: {
    label: "Factor de rodeo (km por calle ÷ km en línea recta)",
    value: 1.29,
    unit: "×",
    kind: "estimado",
    topic: "tiempos",
    source:
      "Mediana sobre los pares a más de 1 km de la matriz OSRM (© OpenStreetMap, ODbL), calculada por scripts/build-travel-matrix.ts",
    url: null,
    date: "2026-10-17",
  },
  walkingSpeed: {
    label: "Velocidad a pie",
    value: 4.5,
    unit: "km/h",
    kind: "estimado",
    topic: "tiempos",
    source:
      "Supuesto del equipo: paso urbano de un adulto. La caminata se mide en línea recta × el factor de rodeo.",
    url: null,
    date: "2026-10-17",
  },
  freeFlowSpeed: {
    label: "Velocidad en auto a flujo libre, para pares sin dato en la matriz",
    value: 42.5,
    unit: "km/h",
    kind: "estimado",
    topic: "tiempos",
    source:
      "Mediana sobre los pares a más de 1 km de la matriz OSRM (© OpenStreetMap, ODbL), calculada por scripts/build-travel-matrix.ts",
    url: null,
    date: "2026-10-17",
  },
  travelMatrix: {
    label:
      "Tiempos y distancias en auto a flujo libre entre los lugares de la demo, todos contra todos",
    value: travelMatrix.ids.length,
    unit: "lugares",
    kind: "dato",
    topic: "tiempos",
    source: `${travelMatrix.source}. ${travelMatrix.license}`,
    url: "https://www.openstreetmap.org/copyright",
    date: travelMatrix.retrievedAt,
  },
  fuelEconomy: {
    label: "Rendimiento de un auto a gasolina, para el CO₂ evitado",
    value: 35,
    unit: "km por galón",
    kind: "estimado",
    topic: "impacto",
    source:
      "Supuesto del equipo: un auto particular a gasolina en Lima. Convierte los km evitados en galones no quemados.",
    url: null,
    date: "2026-10-17",
  },
  gasolineCo2: {
    label: "CO₂ que emite un galón de gasolina",
    value: 8.887,
    unit: "kg de CO₂ por galón",
    kind: "dato",
    topic: "impacto",
    source:
      "EPA, Greenhouse Gas Emissions from a Typical Passenger Vehicle: 8887 g de CO₂ por galón",
    url: "https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle",
    date: "2026-10-17",
  },
  gasolinePriceMin: {
    label: "Precio más bajo del gasohol regular en Lima",
    value: 20.09,
    unit: "S/ por galón",
    kind: "dato",
    topic: "impacto",
    source: gasolinePrices,
    url: gasolinePricesUrl,
    date: "2026-10-17",
  },
  gasolinePriceMax: {
    label: "Precio más alto del gasohol regular en Lima",
    value: 24.49,
    unit: "S/ por galón",
    kind: "dato",
    topic: "impacto",
    source: gasolinePrices,
    url: gasolinePricesUrl,
    date: "2026-10-17",
  },
  gasolinePriceCentral: {
    label: "Precio del galón de gasolina para estimar el combustible",
    value: 22.29,
    unit: "S/ por galón",
    kind: "estimado",
    topic: "impacto",
    source:
      "Supuesto del equipo: el punto medio entre el precio más bajo y el más alto del gasohol regular en Lima.",
    url: null,
    date: "2026-10-17",
  },
  corredorRojoFare: {
    label: "Pasaje general del Corredor Rojo",
    value: 2.43,
    unit: "S/ por viaje",
    kind: "dato",
    topic: "contexto",
    source: "El Peruano, 17 de abril de 2026: «La tarifa general en el corredor Rojo es de S/2.43»",
    url: "https://www.elperuano.pe/noticia/293781-buscas-ahorrar-en-tus-viajes-conoce-las-tarifas-promocionales-e-integradas-del-corredor-rojo",
    date: "2026-10-17",
  },
  linea1Fare: {
    label: "Pasaje adulto de la Línea 1 del Metro de Lima",
    value: 1.5,
    unit: "S/ por viaje",
    kind: "dato",
    topic: "contexto",
    source: "Línea 1, tarifas de pasajes (consultado el 17 de octubre de 2026)",
    url: "https://www.lineauno.pe/tarifas/",
    date: "2026-10-17",
  },
  ownCarCommuteShare: {
    label: "Personas en Lima que van a trabajar principalmente en su propio auto",
    value: 7,
    unit: "%",
    kind: "dato",
    topic: "contexto",
    source:
      "Lima Cómo Vamos, Encuesta Lima Cómo Vamos 2024: «¿Cómo se movilizó principalmente para su viaje de trabajo fuera de casa?», automóvil propio",
    url: "https://www.limacomovamos.org/wp-content/uploads/2025/01/EncuestaLCV2024.pdf",
    date: "2026-10-17",
  },
} as const satisfies Record<string, Source>;

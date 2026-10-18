import type { DataSourcesResponseSchema } from "@andes-hack/api";
import type { z } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";

import { createDataSourcesRoutes } from "./data-sources";

async function dataSources() {
  const response = await createDataSourcesRoutes().request("/public/data-sources");
  const body = (await response.json()) as z.infer<typeof DataSourcesResponseSchema>;
  return { status: response.status, body };
}

describe("GET /public/data-sources (US-032)", () => {
  it("lists the fuel economy behind the avoided CO₂ as an estimate", async () => {
    const { status, body } = await dataSources();

    expect(status).toBe(200);
    expect(body.sources).toContainEqual({
      id: "fuelEconomy",
      topic: "impacto",
      label: "Rendimiento de un auto a gasolina, para el CO₂ evitado y el combustible",
      value: 35,
      unit: "km por galón",
      kind: "estimado",
      source:
        "Supuesto del equipo: un auto particular a gasolina en Lima. Convierte los km evitados en galones no quemados.",
      url: null,
      date: "2026-10-17",
    });
  });

  it("gives the price range of gasoline in Lima as real data and its middle as an estimate", async () => {
    const { body } = await dataSources();
    const gasoline = body.sources.filter((row) => row.id.startsWith("gasolinePrice"));

    expect(gasoline).toEqual([
      {
        id: "gasolinePriceMin",
        topic: "impacto",
        label: "Precio más bajo del gasohol regular en Lima",
        value: 20.09,
        unit: "S/ por galón",
        kind: "dato",
        source: "Facilito (Osinergmin), vía Infobae, 17 de octubre de 2026",
        url: "https://www.infobae.com/peru/2026/10/17/consulta-en-este-link-el-precio-de-la-gasolina-mas-barata-y-cara-en-lima-hoy-17-de-octubre/",
        date: "2026-10-17",
      },
      {
        id: "gasolinePriceMax",
        topic: "impacto",
        label: "Precio más alto del gasohol regular en Lima",
        value: 24.49,
        unit: "S/ por galón",
        kind: "dato",
        source: "Facilito (Osinergmin), vía Infobae, 17 de octubre de 2026",
        url: "https://www.infobae.com/peru/2026/10/17/consulta-en-este-link-el-precio-de-la-gasolina-mas-barata-y-cara-en-lima-hoy-17-de-octubre/",
        date: "2026-10-17",
      },
      {
        id: "gasolinePriceCentral",
        topic: "impacto",
        label: "Precio del galón de gasolina para estimar el combustible",
        value: 22.29,
        unit: "S/ por galón",
        kind: "estimado",
        source:
          "Supuesto del equipo: el punto medio entre el precio más bajo y el más alto del gasohol regular en Lima.",
        url: null,
        date: "2026-10-17",
      },
    ]);
  });

  it("gives the public transport fares and the share who drive to work, with their sources", async () => {
    const { body } = await dataSources();
    const context = body.sources.filter((row) => row.topic === "contexto");

    expect(context).toEqual([
      {
        id: "corredorRojoFare",
        topic: "contexto",
        label: "Pasaje general del Corredor Rojo",
        value: 2.43,
        unit: "S/ por viaje",
        kind: "dato",
        source:
          "El Peruano, 17 de abril de 2026: «La tarifa general en el corredor Rojo es de S/2.43»",
        url: "https://www.elperuano.pe/noticia/293781-buscas-ahorrar-en-tus-viajes-conoce-las-tarifas-promocionales-e-integradas-del-corredor-rojo",
        date: "2026-10-17",
      },
      {
        id: "linea1Fare",
        topic: "contexto",
        label: "Pasaje adulto de la Línea 1 del Metro de Lima",
        value: 1.5,
        unit: "S/ por viaje",
        kind: "dato",
        source: "Línea 1, tarifas de pasajes (consultado el 17 de octubre de 2026)",
        url: "https://www.lineauno.pe/tarifas/",
        date: "2026-10-17",
      },
      {
        id: "ownCarCommuteShare",
        topic: "contexto",
        label: "Personas en Lima que van a trabajar principalmente en su propio auto",
        value: 7,
        unit: "%",
        kind: "dato",
        source:
          "Lima Cómo Vamos, Encuesta Lima Cómo Vamos 2024: «¿Cómo se movilizó principalmente para su viaje de trabajo fuera de casa?», automóvil propio",
        url: "https://www.limacomovamos.org/wp-content/uploads/2025/01/EncuestaLCV2024.pdf",
        date: "2026-10-17",
      },
    ]);
  });

  it("credits the OSRM matrix behind the travel times, with the day it was asked and © OpenStreetMap", async () => {
    const { body } = await dataSources();

    expect(body.sources).toContainEqual({
      id: "travelMatrix",
      topic: "tiempos",
      label:
        "Tiempos y distancias en auto a flujo libre entre los lugares de la demo, todos contra todos",
      value: 76,
      unit: "lugares",
      kind: "dato",
      source:
        "OSRM (router.project-osrm.org), perfil driving: tiempos a flujo libre, sin tráfico. © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)",
      url: "https://www.openstreetmap.org/copyright",
      date: "2026-10-17",
    });
  });

  // Guards every constant added later: none reaches /datos without a kind, a source and a
  // date, and only what links a source anyone can check is called real data.
  it("gives every constant a kind, a source and a date, and a link to every real one", async () => {
    const { body } = await dataSources();

    for (const row of body.sources) {
      expect(row, row.id).toMatchObject({
        kind: expect.stringMatching(/^(dato|estimado)$/),
        source: expect.stringMatching(/\S/),
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      if (row.kind === "dato") expect(row.url, row.id).toMatch(/^https:\/\//);
    }
  });
});

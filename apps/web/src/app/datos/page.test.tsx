import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, type AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, { NEXT_PUBLIC_SERVER_URL: "http://localhost:3000" });
});

import { httpClient } from "@/lib/http-client";

import DataPage from "./page";

const fuelEconomy = {
  id: "fuelEconomy",
  topic: "impacto",
  label: "Rendimiento de un auto a gasolina, para el CO₂ evitado",
  value: 35,
  unit: "km por galón",
  kind: "estimado",
  source: "Supuesto del equipo: un auto particular a gasolina en Lima.",
  url: null,
  date: "2026-10-17",
};

const gasolineCo2 = {
  id: "gasolineCo2",
  topic: "impacto",
  label: "CO₂ que emite un galón de gasolina",
  value: 8.887,
  unit: "kg de CO₂ por galón",
  kind: "dato",
  source: "EPA, Greenhouse Gas Emissions from a Typical Passenger Vehicle",
  url: "https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle",
  date: "2026-10-17",
};

// The API at the HTTP boundary: it answers GET /public/data-sources like the server.
let replies: { status: number; data: unknown }[];

beforeEach(() => {
  replies = [{ status: 200, data: { sources: [fuelEconomy, gasolineCo2] } }];
  httpClient.defaults.adapter = async (config) => {
    const reply = replies.length > 1 ? replies.shift()! : replies[0]!;
    const response = {
      data: reply.data,
      status: reply.status,
      statusText: "",
      headers: {},
      config,
    } as AxiosResponse;
    if (reply.status >= 400) {
      throw new AxiosError("Request failed", "ERR_BAD_RESPONSE", config, null, response);
    }
    return response;
  };
});

describe("data page (US-032)", () => {
  it("shows the fuel economy as an estimate and the EPA emission factor as real data, under impact", async () => {
    render(<DataPage />);

    const impact = await screen.findByRole("region", { name: "Impacto y combustible" });
    expect(impact).toHaveAttribute("id", "impacto");

    const economy = within(impact).getByRole("row", { name: /Rendimiento de un auto/ });
    expect(
      within(economy)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual([
      "Rendimiento de un auto a gasolina, para el CO₂ evitado",
      "35 km por galón",
      "Estimado",
      "Supuesto del equipo: un auto particular a gasolina en Lima.",
    ]);

    const emission = within(impact).getByRole("row", { name: /CO₂ que emite/ });
    expect(
      within(emission)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual([
      "CO₂ que emite un galón de gasolina",
      "8,887 kg de CO₂ por galón",
      "Dato real · fuente · consultado el 17-10-2026",
      "EPA, Greenhouse Gas Emissions from a Typical Passenger Vehicle",
    ]);
    expect(within(emission).getByRole("link", { name: "fuente" })).toHaveAttribute(
      "href",
      "https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle",
    );
  });

  it("says it could not load the data and loads it again on retry", async () => {
    replies = [
      { status: 500, data: { success: false, status: 500, error: "Error interno." } },
      { status: 200, data: { sources: [fuelEconomy] } },
    ];
    render(<DataPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar los datos.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("row", { name: /Rendimiento de un auto/ })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says what Te Jalo does not measure", async () => {
    render(<DataPage />);

    const notMeasured = await screen.findByRole("region", { name: "Qué no medimos" });
    expect(
      within(notMeasured)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "La congestión de Lima: los viajes en auto evitados son pocos frente al tráfico de la ciudad, y no estimamos cuánto lo reducen.",
      "El impacto en una empresa real: las cifras salen de la comunidad demo, no de un piloto.",
    ]);
  });

  it("writes soles before the amount, the way fares are read in Lima", async () => {
    replies = [
      {
        status: 200,
        data: {
          sources: [
            {
              id: "corredorRojoFare",
              topic: "contexto",
              label: "Pasaje general del Corredor Rojo",
              value: 2.43,
              unit: "S/ por viaje",
              kind: "dato",
              source: "El Peruano, 17 de abril de 2026",
              url: "https://www.elperuano.pe/noticia/293781-buscas-ahorrar-en-tus-viajes-conoce-las-tarifas-promocionales-e-integradas-del-corredor-rojo",
              date: "2026-10-17",
            },
          ],
        },
      },
    ];
    render(<DataPage />);

    const lima = await screen.findByRole("region", { name: "Transporte en Lima" });
    expect(within(lima).getByRole("cell", { name: "S/ 2,43 por viaje" })).toBeInTheDocument();
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, type AxiosAdapter } from "axios";
import { afterEach, expect, it, vi } from "vitest";

import { httpClient } from "@/lib/http-client";

import IncidentReportForm from "./incident-report-form";

const OFFER_ID = "22222222-2222-4222-8222-222222222222";
const originalAdapter = httpClient.defaults.adapter;
let sentRequest: { url: string | undefined; data: string | undefined } | undefined;

afterEach(() => {
  cleanup();
  httpClient.defaults.adapter = originalAdapter;
  sentRequest = undefined;
  vi.restoreAllMocks();
});

it("submits a report through HTTP and confirms the privacy promise", async () => {
  const user = userEvent.setup();
  const adapter: AxiosAdapter = async (config) => {
    sentRequest = { url: config.url, data: config.data as string | undefined };
    return {
      data: {
        success: true,
        status: 201,
        data: {
          id: "33333333-3333-4333-8333-333333333333",
          status: "open",
          createdAt: "2026-10-18T17:30:00.000Z",
        },
      },
      status: 201,
      statusText: "Created",
      headers: {},
      config,
    };
  };
  httpClient.defaults.adapter = adapter;

  render(<IncidentReportForm offerId={OFFER_ID} />);
  await user.selectOptions(screen.getByLabelText("Tipo"), "inappropriate_behavior");
  await user.type(
    screen.getByLabelText("Describe lo que pasó (opcional, máximo 1000 caracteres)"),
    "Se comportó de forma agresiva.",
  );
  expect(
    screen.getByText("Si estás en peligro, llama al 105 (Policía Nacional)."),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Enviar reporte" }));

  expect(
    await screen.findByText(
      "Recibimos tu reporte. Tu identidad no se comparte con la persona reportada.",
    ),
  ).toBeInTheDocument();
  expect(sentRequest?.url).toBe("/incident-reports");
  expect(JSON.parse(sentRequest?.data ?? "{}")).toEqual({
    offerId: OFFER_ID,
    type: "inappropriate_behavior",
    description: "Se comportó de forma agresiva.",
  });
});

it("shows the fixed retry message when the HTTP request fails", async () => {
  const user = userEvent.setup();
  const adapter: AxiosAdapter = async (config) => {
    throw new AxiosError("offline", AxiosError.ERR_NETWORK, config);
  };
  httpClient.defaults.adapter = adapter;

  render(<IncidentReportForm offerId={OFFER_ID} />);
  await user.click(screen.getByRole("button", { name: "Enviar reporte" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No pudimos enviar tu reporte. Inténtalo de nuevo.",
  );
});

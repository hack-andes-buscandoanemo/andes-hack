import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AxiosAdapter } from "axios";
import { afterEach, expect, it } from "vitest";

import { httpClient } from "@/lib/http-client";

import TripChat from "./trip-chat";

const OFFER_ID = "22222222-2222-4222-8222-222222222222";
const MESSAGE_ID = "33333333-3333-4333-8333-333333333333";
const originalAdapter = httpClient.defaults.adapter;
let reportPayload: Record<string, unknown> | undefined;

afterEach(() => {
  cleanup();
  httpClient.defaults.adapter = originalAdapter;
  reportPayload = undefined;
});

it("reports a chat message by id without copying its text", async () => {
  const adapter: AxiosAdapter = async (config) => {
    if (config.url?.startsWith(`/offers/${OFFER_ID}/messages`)) {
      return {
        data: {
          conversation: {
            offerId: OFFER_ID,
            communityName: "Comunidad Alfa",
            origin: "La Molina",
            destination: "Centro Empresarial Real",
            departureTime: "07:00:00",
            date: null,
            daysOfWeek: [1, 2, 3],
            role: "passenger",
            participants: [
              { name: "Mateo M.", role: "driver", photoUrl: null },
              { name: "Lucía R.", role: "passenger", photoUrl: null },
            ],
            meetingPoints: [],
          },
          messages: [
            {
              id: MESSAGE_ID,
              senderId: "u-driver",
              senderName: "Mateo M.",
              senderPhotoUrl: null,
              senderRole: "driver",
              kind: "text",
              body: "Mensaje privado del viaje",
              createdAt: "2026-10-18T17:30:00.000Z",
            },
          ],
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    }
    if (config.url === "/incident-reports") {
      reportPayload = JSON.parse(String(config.data)) as Record<string, unknown>;
      return {
        data: {
          success: true,
          status: 201,
          data: {
            id: "44444444-4444-4444-8444-444444444444",
            status: "open",
            createdAt: "2026-10-18T17:30:00.000Z",
          },
        },
        status: 201,
        statusText: "Created",
        headers: {},
        config,
      };
    }
    throw new Error(`Unexpected HTTP request: ${config.method} ${config.url}`);
  };
  httpClient.defaults.adapter = adapter;
  const user = userEvent.setup();

  render(<TripChat offerId={OFFER_ID} />);
  expect(await screen.findByText("Mensaje privado del viaje")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Reportar mensaje" }));
  await user.selectOptions(screen.getByLabelText("Tipo"), "harassment");
  await user.click(screen.getByRole("button", { name: "Enviar reporte" }));

  expect(
    await screen.findByText(
      "Recibimos tu reporte. Tu identidad no se comparte con la persona reportada.",
    ),
  ).toBeInTheDocument();
  expect(reportPayload).toEqual({ offerId: OFFER_ID, type: "harassment", messageId: MESSAGE_ID });
  expect(JSON.stringify(reportPayload)).not.toContain("Mensaje privado del viaje");
});

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AxiosAdapter } from "axios";
import { afterEach, expect, it } from "vitest";

import { httpClient } from "@/lib/http-client";

import CommunityReports from "./community-reports";

const COMMUNITY_ID = "22222222-2222-4222-8222-222222222222";
const REPORT_ID = "33333333-3333-4333-8333-333333333333";
const originalAdapter = httpClient.defaults.adapter;
let reviewPayload: Record<string, unknown> | undefined;

afterEach(() => {
  cleanup();
  httpClient.defaults.adapter = originalAdapter;
  reviewPayload = undefined;
});

it("shows a community report and marks it reviewed through HTTP", async () => {
  const adapter: AxiosAdapter = async (config) => {
    if (config.method === "get") {
      return {
        data: {
          reports: [
            {
              id: REPORT_ID,
              offerId: "44444444-4444-4444-8444-444444444444",
              reportedUserId: "u-target",
              reportedUserName: "Lucía R.",
              messageId: null,
              type: "harassment",
              description: "Me gritó durante el viaje.",
              status: "open",
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
    if (config.method === "patch") {
      reviewPayload = JSON.parse(String(config.data)) as Record<string, unknown>;
      return {
        data: { id: REPORT_ID, status: "reviewed" },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    }
    throw new Error(`Unexpected HTTP request: ${config.method} ${config.url}`);
  };
  httpClient.defaults.adapter = adapter;
  const user = userEvent.setup();

  render(<CommunityReports communityId={COMMUNITY_ID} />);

  expect(await screen.findByText("Me gritó durante el viaje.")).toBeInTheDocument();
  expect(screen.getByText(/Lucía R\./)).toBeInTheDocument();
  expect(screen.getByText("Abierto")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Marcar como revisado" }));

  expect(await screen.findByText("Revisado")).toBeInTheDocument();
  expect(reviewPayload).toEqual({ status: "reviewed" });
});

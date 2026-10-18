import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, type AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listProposals = vi.fn();
const requestSeat = vi.fn();

vi.mock("@/lib/communities-api", () => ({
  communitiesApi: {
    listProposals: (...args: unknown[]) => listProposals(...args),
    requestSeat: (...args: unknown[]) => requestSeat(...args),
  },
}));

import Proposals from "./proposals";

const COMMUNITY_ID = "11111111-1111-4111-8111-111111111111";

const PROPOSAL = {
  suggestionId: "s-1",
  offerId: "22222222-2222-4222-8222-222222222222",
  driverName: "Mateo Q.",
  direction: "outbound" as const,
  date: "2026-10-19",
  meetingPointName: "Estación San Borja Sur (Línea 1)",
  pickupAt: "07:29",
  arrivalAt: "07:44",
  walkMinutes: 14,
};

function serverError(status: number, error: string) {
  const response = { status, data: { success: false, status, error } } as AxiosResponse;
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, null, response);
}

beforeEach(() => {
  listProposals.mockReset().mockResolvedValue([PROPOSAL]);
  requestSeat.mockReset();
});

describe("proposals on Inicio (US-019)", () => {
  it("shows the passenger the trip recommended to them, with its detail and a seat request", async () => {
    requestSeat.mockResolvedValue({ booking: { id: "b-1", status: "pending" } });
    const user = userEvent.setup();
    render(<Proposals communityId={COMMUNITY_ID} />);

    expect(
      await screen.findByText("Tenemos una propuesta para ti: viaje de Mateo Q."),
    ).toBeInTheDocument();
    expect(screen.getByText("Ida · Lunes 19 de octubre")).toBeInTheDocument();
    expect(
      screen.getByText("Estación San Borja Sur (Línea 1) · Recogida 7:29 a. m."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver detalle" })).toHaveAttribute(
      "href",
      `/viajes/${PROPOSAL.offerId}`,
    );

    await user.click(screen.getByRole("button", { name: "Solicitar asiento" }));

    expect(requestSeat).toHaveBeenCalledWith(PROPOSAL.offerId);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Solicitud enviada. Te avisaremos cuando Mateo Q. responda.",
    );
    expect(screen.queryByRole("button", { name: "Solicitar asiento" })).not.toBeInTheDocument();
  });

  it("explains why a seat could not be requested and renders nothing without proposals", async () => {
    requestSeat.mockRejectedValue(serverError(409, "Este viaje ya no tiene asientos libres."));
    const user = userEvent.setup();
    const { unmount } = render(<Proposals communityId={COMMUNITY_ID} />);

    await user.click(await screen.findByRole("button", { name: "Solicitar asiento" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este viaje ya no tiene asientos libres.",
    );
    unmount();

    listProposals.mockResolvedValue([]);
    const { container } = render(<Proposals communityId={COMMUNITY_ID} />);
    await vi.waitFor(() => expect(listProposals).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });
});

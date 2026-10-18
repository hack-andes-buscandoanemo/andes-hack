import type { components } from "./api-schema";
import { httpClient } from "./http-client";

export type CommunitySummary = components["schemas"]["CommunitySummary"];
export type JoinCommunityResponse = components["schemas"]["JoinCommunityResponse"];
export type MeResponse = components["schemas"]["MeResponse"];
export type MembershipSummary = components["schemas"]["MembershipSummary"];
export type UpdateMembershipRequest = components["schemas"]["UpdateMembershipRequest"];
export type VehicleSummary = components["schemas"]["VehicleSummary"];
export type CreateVehicleRequest = components["schemas"]["CreateVehicleRequest"];
export type ZoneSummary = components["schemas"]["ZoneSummary"];
export type TripOfferSummary = components["schemas"]["TripOfferSummary"];
export type CreateTripOfferRequest = components["schemas"]["CreateTripOfferRequest"];
export type CreateTripOfferResponse = components["schemas"]["CreateTripOfferResponse"];
export type SearchTripsRequest = components["schemas"]["SearchTripsRequest"];
export type SearchTripsResponse = components["schemas"]["SearchTripsResponse"];
export type TripMatch = components["schemas"]["TripMatch"];
export type OfferDetail = components["schemas"]["OfferDetail"];
export type RequestSeatResponse = components["schemas"]["RequestSeatResponse"];
export type MyTrip = components["schemas"]["MyTrip"];
export type MyTripsResponse = components["schemas"]["MyTripsResponse"];
export type CancelBookingResponse = components["schemas"]["CancelBookingResponse"];
export type RunMatchingRequest = components["schemas"]["RunMatchingRequest"];
export type MatchRunsResponse = components["schemas"]["MatchRunsResponse"];
export type MatchSuggestion = components["schemas"]["MatchSuggestion"];
export type MatchProposal = components["schemas"]["MatchProposal"];

export const communitiesApi = {
  async listCommunities(): Promise<CommunitySummary[]> {
    const response = await httpClient.get("/communities");
    return response.data.communities;
  },
  async joinCommunity(communityId: string, code: string): Promise<JoinCommunityResponse> {
    const response = await httpClient.post(
      `/communities/${communityId}/join` as "/communities/{id}/join",
      { code },
    );
    return response.data;
  },
  async sendEmailOtp(communityId: string, email: string): Promise<{ success: boolean }> {
    const response = await httpClient.post(
      "/api/auth/email-otp/send-verification-otp" as never,
      { email, type: "email-verification", communityId } as never,
    );
    return (response as { data: { success: boolean } }).data;
  },
  async verifyEmailOtp(email: string, otp: string): Promise<{ status: boolean }> {
    const response = await httpClient.post(
      "/api/auth/email-otp/verify-email" as never,
      { email, otp } as never,
    );
    return (response as { data: { status: boolean } }).data;
  },
  async confirmEmailMembership(communityId: string): Promise<JoinCommunityResponse> {
    const response = await httpClient.post(
      `/communities/${communityId}/verify-email` as "/communities/{id}/verify-email",
    );
    return response.data;
  },
  async getMe(): Promise<MeResponse> {
    const response = await httpClient.get("/me");
    return response.data;
  },
  async updateMembership(
    communityId: string,
    payload: UpdateMembershipRequest,
  ): Promise<MembershipSummary> {
    const response = await httpClient.patch(
      `/communities/${communityId}/membership` as "/communities/{id}/membership",
      payload,
    );
    return response.data;
  },
  async listVehicles(): Promise<VehicleSummary[]> {
    const response = await httpClient.get("/vehicles");
    return response.data.vehicles;
  },
  async createVehicle(payload: CreateVehicleRequest): Promise<VehicleSummary> {
    const response = await httpClient.post("/vehicles", payload);
    return response.data;
  },
  async listCommunityZones(communityId: string): Promise<ZoneSummary[]> {
    const response = await httpClient.get(
      `/communities/${communityId}/zones` as "/communities/{id}/zones",
    );
    return response.data.zones;
  },
  async listCommunityOffers(communityId: string): Promise<TripOfferSummary[]> {
    const response = await httpClient.get(
      `/communities/${communityId}/offers` as "/communities/{id}/offers",
    );
    return response.data.offers;
  },
  async createCommunityOffer(
    communityId: string,
    payload: CreateTripOfferRequest,
  ): Promise<CreateTripOfferResponse> {
    const response = await httpClient.post(
      `/communities/${communityId}/offers` as "/communities/{id}/offers",
      payload,
    );
    return response.data;
  },
  async updateOfferStatus(offerId: string, status: "active" | "paused"): Promise<TripOfferSummary> {
    const response = await httpClient.patch(`/offers/${offerId}/status` as "/offers/{id}/status", {
      status,
    });
    return response.data;
  },
  async searchTrips(
    communityId: string,
    payload: SearchTripsRequest,
  ): Promise<SearchTripsResponse> {
    const response = await httpClient.post(
      `/communities/${communityId}/search` as "/communities/{id}/search",
      payload,
    );
    return response.data;
  },
  async getOfferDetail(offerId: string): Promise<OfferDetail> {
    const response = await httpClient.get(`/offers/${offerId}` as "/offers/{id}");
    return response.data;
  },
  async requestSeat(offerId: string, message?: string): Promise<RequestSeatResponse> {
    const response = await httpClient.post(
      `/offers/${offerId}/bookings` as "/offers/{id}/bookings",
      { message },
    );
    return response.data;
  },
  async listMyTrips(
    role: "passenger" | "driver",
    scope: "upcoming" | "past",
  ): Promise<MyTripsResponse> {
    const response = await httpClient.get("/me/trips", { params: { role, scope } });
    return response.data;
  },
  async cancelBooking(bookingId: string): Promise<CancelBookingResponse> {
    const response = await httpClient.post(
      `/bookings/${bookingId}/cancel` as "/bookings/{id}/cancel",
    );
    return response.data;
  },
  async runMatching(communityId: string, payload: RunMatchingRequest): Promise<MatchRunsResponse> {
    const response = await httpClient.post(
      `/communities/${communityId}/match-runs` as "/communities/{id}/match-runs",
      payload,
    );
    return response.data;
  },
  async latestMatchRuns(communityId: string): Promise<MatchRunsResponse> {
    const response = await httpClient.get(
      `/communities/${communityId}/match-runs/latest` as "/communities/{id}/match-runs/latest",
    );
    return response.data;
  },
  async listProposals(communityId: string): Promise<MatchProposal[]> {
    const response = await httpClient.get(
      `/communities/${communityId}/proposals` as "/communities/{id}/proposals",
    );
    return response.data.proposals;
  },
};

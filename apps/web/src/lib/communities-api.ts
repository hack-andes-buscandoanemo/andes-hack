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
};

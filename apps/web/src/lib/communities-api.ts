import type { components } from "./api-schema";
import { httpClient } from "./http-client";

export type CommunitySummary = components["schemas"]["CommunitySummary"];
export type JoinCommunityResponse = components["schemas"]["JoinCommunityResponse"];

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
};

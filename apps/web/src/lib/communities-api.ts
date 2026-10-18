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
};

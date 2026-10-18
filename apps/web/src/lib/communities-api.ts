import type { components } from "./api-schema";
import { httpClient } from "./http-client";

export type CommunitySummary = components["schemas"]["CommunitySummary"];
export type JoinCommunityResponse = components["schemas"]["JoinCommunityResponse"];
export type MeResponse = components["schemas"]["MeResponse"];
export type DeleteMeResponse = components["schemas"]["DeleteMeResponse"];
export type MembershipSummary = components["schemas"]["MembershipSummary"];
export type UpdateMembershipRequest = components["schemas"]["UpdateMembershipRequest"];
export type TravelPreferences = components["schemas"]["TravelPreferences"];
export type TravelPreferencesResponse = components["schemas"]["TravelPreferencesResponse"];
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
export type RouteMap = components["schemas"]["RouteMap"];
export type MyTrip = components["schemas"]["MyTrip"];
export type MyTripsResponse = components["schemas"]["MyTripsResponse"];
export type RequestSeatRequest = components["schemas"]["RequestSeatRequest"];
export type RequestSeatResponse = components["schemas"]["RequestSeatResponse"];
export type MyImpact = components["schemas"]["MyImpact"];
export type CancelBookingResponse = components["schemas"]["CancelBookingResponse"];
export type CancelOfferResponse = components["schemas"]["CancelOfferResponse"];
export type RunMatchingRequest = components["schemas"]["RunMatchingRequest"];
export type MatchRunsResponse = components["schemas"]["MatchRunsResponse"];
export type MatchSuggestion = components["schemas"]["MatchSuggestion"];
export type MatchProposal = components["schemas"]["MatchProposal"];
export type OfferBookingsResponse = components["schemas"]["OfferBookingsResponse"];
export type AcceptBookingResponse = components["schemas"]["AcceptBookingResponse"];
export type RejectBookingResponse = components["schemas"]["RejectBookingResponse"];
export type StartTripResponse = components["schemas"]["StartTripResponse"];
export type TripProgressResponse = components["schemas"]["TripProgressResponse"];
export type MyChatsResponse = components["schemas"]["MyChatsResponse"];
export type TripMessagesResponse = components["schemas"]["TripMessagesResponse"];
export type TripMessage = TripMessagesResponse["messages"][number];
export type TripMessagePayload =
  | { kind: "text"; body: string }
  | {
      kind: "quick";
      body: "Ya salí" | "Estoy en el punto de encuentro" | "Llego en 5 min" | "Hoy no podré ir";
    };
export type PublicStats = components["schemas"]["PublicStats"];
export type CreateShareLinkResponse = components["schemas"]["CreateShareLinkResponse"];
export type SharedTrip = components["schemas"]["SharedTrip"];
export type ProfilePhotoUploadRequest = components["schemas"]["ProfilePhotoUploadRequest"];
export type ProfilePhotoUploadResponse = components["schemas"]["ProfilePhotoUploadResponse"];
export type MyProfilePhotoResponse = components["schemas"]["MyProfilePhotoResponse"];

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
  async deleteMe(): Promise<DeleteMeResponse> {
    const response = await httpClient.delete("/me");
    return response.data;
  },
  async getMyProfilePhoto(): Promise<MyProfilePhotoResponse> {
    const response = await httpClient.get("/me/profile-photo");
    return response.data;
  },
  async uploadProfilePhoto(
    payload: ProfilePhotoUploadRequest,
  ): Promise<ProfilePhotoUploadResponse> {
    const response = await httpClient.post("/me/profile-photo/upload", payload);
    return response.data;
  },
  async confirmProfilePhoto(key: string): Promise<{ photoUrl: string }> {
    const response = await httpClient.post("/me/profile-photo/confirm", { key });
    return response.data;
  },
  async deleteMyProfilePhoto(): Promise<{ message: string }> {
    const response = await httpClient.delete("/me/profile-photo");
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
  async updateTravelPreferences(
    communityId: string,
    payload: TravelPreferences,
  ): Promise<TravelPreferencesResponse> {
    const response = await httpClient.put(
      `/communities/${communityId}/preferences` as "/communities/{id}/preferences",
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
  async listMyTrips(
    role: "passenger" | "driver",
    scope: "upcoming" | "past",
  ): Promise<MyTripsResponse> {
    const response = await httpClient.get("/me/trips", { params: { role, scope } });
    return response.data;
  },
  async requestSeat(
    offerId: string,
    payload: RequestSeatRequest = {},
  ): Promise<RequestSeatResponse> {
    const response = await httpClient.post(
      `/offers/${offerId}/bookings` as "/offers/{id}/bookings",
      payload,
    );
    return response.data;
  },
  async getMyImpact(communityId: string): Promise<MyImpact> {
    const response = await httpClient.get(
      `/communities/${communityId}/me/impact` as "/communities/{id}/me/impact",
    );
    return response.data;
  },
  async cancelBooking(bookingId: string): Promise<CancelBookingResponse> {
    const response = await httpClient.post(
      `/bookings/${bookingId}/cancel` as "/bookings/{id}/cancel",
    );
    return response.data;
  },
  async createShareLink(bookingId: string): Promise<CreateShareLinkResponse> {
    const response = await httpClient.post(
      `/bookings/${bookingId}/share-links` as "/bookings/{id}/share-links",
    );
    return response.data;
  },
  async revokeShareLink(linkId: string): Promise<void> {
    await httpClient.delete(`/share-links/${linkId}` as "/share-links/{id}");
  },
  async getSharedTrip(token: string): Promise<SharedTrip> {
    const response = await httpClient.get(`/public/share/${token}` as "/public/share/{token}");
    return response.data;
  },
  async cancelOffer(offerId: string): Promise<CancelOfferResponse> {
    const response = await httpClient.post(`/offers/${offerId}/cancel` as "/offers/{id}/cancel");
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
  async listOfferBookings(offerId: string): Promise<OfferBookingsResponse> {
    const response = await httpClient.get(`/offers/${offerId}/bookings` as "/offers/{id}/bookings");
    return response.data;
  },
  async acceptBooking(bookingId: string): Promise<AcceptBookingResponse> {
    const response = await httpClient.post(
      `/bookings/${bookingId}/accept` as "/bookings/{id}/accept",
    );
    return response.data;
  },
  async rejectBooking(bookingId: string): Promise<RejectBookingResponse> {
    const response = await httpClient.post(
      `/bookings/${bookingId}/reject` as "/bookings/{id}/reject",
    );
    return response.data;
  },
  async startTrip(offerId: string): Promise<StartTripResponse> {
    const response = await httpClient.post(`/offers/${offerId}/start` as "/offers/{id}/start");
    return response.data;
  },
  async boardBooking(bookingId: string): Promise<TripProgressResponse> {
    const response = await httpClient.post(
      `/bookings/${bookingId}/board` as "/bookings/{id}/board",
    );
    return response.data;
  },
  async arriveBooking(bookingId: string): Promise<TripProgressResponse> {
    const response = await httpClient.post(
      `/bookings/${bookingId}/arrive` as "/bookings/{id}/arrive",
    );
    return response.data;
  },
  async noShowBooking(bookingId: string): Promise<TripProgressResponse> {
    const response = await httpClient.post(
      `/bookings/${bookingId}/no-show` as "/bookings/{id}/no-show",
    );
    return response.data;
  },
  async listMyChats(): Promise<MyChatsResponse> {
    const response = await httpClient.get("/me/chats");
    return response.data;
  },
  async getPublicStats(slug: string): Promise<PublicStats> {
    const response = await httpClient.get(
      `/public/communities/${slug}/stats` as "/public/communities/{slug}/stats",
    );
    return response.data;
  },
  async getTripMessages(offerId: string, after?: string): Promise<TripMessagesResponse> {
    const query = after ? `?after=${encodeURIComponent(after)}` : "";
    const response = await httpClient.get(
      `/offers/${offerId}/messages${query}` as "/offers/{id}/messages",
    );
    return response.data;
  },
  async sendTripMessage(
    offerId: string,
    payload: TripMessagePayload,
  ): Promise<{ message: TripMessage }> {
    const response = await httpClient.post(
      `/offers/${offerId}/messages` as "/offers/{id}/messages",
      payload,
    );
    return response.data;
  },
};

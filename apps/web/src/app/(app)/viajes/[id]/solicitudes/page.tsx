import BookingRequests from "./booking-requests";

export default async function BookingRequestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BookingRequests offerId={id} />;
}

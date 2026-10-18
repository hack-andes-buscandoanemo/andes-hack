import TripChat from "./trip-chat";

export default async function TripChatPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  return <TripChat offerId={offerId} />;
}

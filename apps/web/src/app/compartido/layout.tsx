import type { Metadata } from "next";

// A shared link is for one person: search engines skip it and the token never leaks as a referrer.
export const metadata: Metadata = {
  title: "Viaje compartido",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function SharedTripLayout({ children }: { children: React.ReactNode }) {
  return children;
}

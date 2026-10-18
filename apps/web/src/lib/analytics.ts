import { track } from "@plausible-analytics/tracker";

export function trackEvent(name: string) {
  if (typeof window !== "undefined" && "plausible" in window) {
    track(name, { url: `${window.location.origin}/` });
  }
}

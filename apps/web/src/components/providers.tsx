"use client";

import { init } from "@plausible-analytics/tracker";
import { useEffect } from "react";

import { ThemeProvider } from "./theme-provider";
import { Toaster } from "./ui/sonner";

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!("plausible" in window)) {
      init({ domain: "andes-hack-web-diego.diegorafaelcisnerostafur.workers.dev" });
    }
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Toaster richColors />
    </ThemeProvider>
  );
}

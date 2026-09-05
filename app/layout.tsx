import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";

/**
 * Root layout: document, typeface and ground colour only.
 *
 * Deliberately does NOT render the application shell. /login sits outside
 * the (app) route group and must not inherit the nav or the 1140px page
 * container -- a signed-out visitor should not see a navigation bar for an
 * application they cannot reach, and the login card centres on the
 * viewport rather than inside a fixed-width column. The shell lives in
 * app/(app)/layout.tsx and wraps only the authenticated routes.
 */

const EM_DASH = String.fromCharCode(0x2014);

const jakarta = Plus_Jakarta_Sans({
  // latin-ext carries the rupee sign. Every money figure on the app is an INR
  // amount, so this file was being fetched on essentially every screen -- but
  // discovered LATE, after layout, because next/font only preloads the subsets
  // it is told about. Naming it here moves the fetch into the preload <link>
  // and off the critical path. It adds no bytes to the session; it was already
  // being downloaded.
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: `StyleVerse AI ${EM_DASH} Intelligent Merchandising & Planning`,
  description:
    "Forecasting, buy, allocation, markdown and governance for fashion retail planning.",
};

export const viewport: Viewport = {
  themeColor: "#F4F1EE",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="bg-cream text-ink antialiased">{children}</body>
    </html>
  );
}

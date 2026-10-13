/**
 * Root layout for the App Router.
 *
 * Server Component, copied from transformer-explainer's layout (via the companion sites): HTML
 * scaffold, the global stylesheet and the site header. Dark mode follows
 * the system setting (`darkMode: "media"` in tailwind.config.ts).
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteHeader } from "@/components/ui/SiteHeader";
import { SITE_URL } from "@/lib/site";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AI Racks Explained",
    template: "%s · AI Racks Explained",
  },
  description:
    "The machines that train and serve large models, chip to data centre: packages, trays, NVLink racks and scale-out networks, each animated by a tested model with every hardware figure sourced.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}

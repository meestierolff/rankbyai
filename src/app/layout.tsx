import type { Metadata, Viewport } from "next";
import { Archivo, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AnalyticsProvider } from "@/components/analytics/analytics-provider";
import { VercelAnalytics } from "@/components/analytics/vercel-analytics";
import { SkewReload } from "@/components/app/skew-reload";
import { publicEnv } from "@/lib/env";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });
// Display face of the landing page. Variable weight plus the width axis (the design uses 125%).
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: { default: "AI Visibility Tracker You Pay For Once | RankbyAI", template: "%s | RankbyAI" },
  description:
    "See where ChatGPT, Perplexity and Gemini recommend a local business, point by point on a map, next to its Google Maps rank. Pay once. Your own API keys. 14-day refund.",
  applicationName: "RankbyAI",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  openGraph: { type: "website", siteName: "RankbyAI", locale: "en_US" },
  twitter: { card: "summary_large_image" },
  // The brand mark, drawn by scripts/make-icons.mjs. Declared here (not as app/ icon files) so a
  // white-label report can replace it with the agency's own icon.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon.png", type: "image/png", sizes: "256x256" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = { themeColor: "#0b0b0b", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} ${archivo.variable}`}>
      <body className="min-h-dvh">
        {children}
        <AnalyticsProvider />
        {/* Vercel Web Analytics: page views without cookies; report slugs and query strings are never sent. */}
        <VercelAnalytics />
        <SkewReload />
        {/* The Ship or Die hackathon tracker is rendered by the marketing, sign-in and app layouts, not here: never on report links (components/hackathon-tracker.tsx). */}
      </body>
    </html>
  );
}

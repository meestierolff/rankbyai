import type { Metadata, Viewport } from "next";
import { Archivo, Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { AnalyticsProvider } from "@/components/analytics/analytics-provider";
import { miscEnv, publicEnv } from "@/lib/env";

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
  const tracker = miscEnv.sodTrackerSrc();
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} ${archivo.variable}`}>
      <body className="min-h-dvh">
        {children}
        <AnalyticsProvider />
        {/* Vercel Web Analytics: page views without cookies. Collects only once enabled on the Vercel project. */}
        <Analytics />
        {/* Ship or Die hackathon tracker: mandatory on every page. */}
        {tracker ? <Script id="sod-tracker" src={tracker} strategy="afterInteractive" /> : null}
      </body>
    </html>
  );
}

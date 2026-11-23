import type { Metadata } from "next";
import { OAuthFrame } from "@/components/oauth/frame";

// Request-time only (session and query); a blocking render lets the page answer with real redirects.
export const instant = false;

export const metadata: Metadata = { title: "Connect an app", robots: { index: false, follow: false } };

/** The OAuth consent screen in the sign-in frame. Framing by other sites is refused in next.config. */
export default function OAuthLayout({ children }: { children: React.ReactNode }) {
  return <OAuthFrame>{children}</OAuthFrame>;
}

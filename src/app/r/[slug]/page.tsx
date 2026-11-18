import type { Metadata } from "next";
import { io } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { verdict } from "@/components/report/derive";
import { ReportBody } from "@/components/report/report-body";
import { isDatabaseConfigured } from "@/lib/db/clients";
import { isFirstPartyHost, normalizeHost, primaryHostOf } from "@/lib/domains";
import { publicEnv } from "@/lib/env-public";
import { getReportView } from "@/lib/reports";
import { ReportViewed } from "./viewed";

// Share links are unguessable and never indexed.
const ROBOTS: Metadata["robots"] = { index: false, follow: false, nocache: true };

// A blocking route on purpose: the lookup must finish before any byte is sent, so an unknown or
// revoked link gets a real HTTP 404 (a streamed shell would already have answered 200).
export const instant = false;

/** One read per request, shared by the metadata and the page. */
const load = cache(async (slug: string) => (isDatabaseConfigured() ? getReportView(slug) : null));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  await io();
  const { slug } = await params;
  const view = await load(slug);
  if (!view) return { title: "Report", robots: ROBOTS };
  const title = `${view.business.name}: AI visibility report`;
  const description = verdict(view);
  // White-label: no RankbyAI in the title or the link preview's site name.
  const siteName = view.brand.name ?? (view.brand.hideRankbyai ? undefined : "RankbyAI");
  // On an agency's own report domain the preview image URLs use that domain, not the main site's.
  // Only active domains reach this page (the proxy checks the host against the workspace first).
  const host = normalizeHost((await headers()).get("host"));
  const ownDomain = !isFirstPartyHost(host, primaryHostOf()) ? new URL(`https://${host}`) : null;
  return {
    ...(ownDomain ? { metadataBase: ownDomain } : {}),
    title: view.brand.name || view.brand.hideRankbyai ? { absolute: view.brand.name ? `${title} | ${view.brand.name}` : title } : title,
    description,
    robots: ROBOTS,
    openGraph: { type: "article", title, description, ...(siteName ? { siteName } : {}) },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  await io();
  const { slug } = await params;
  const view = await load(slug);
  if (!view) notFound();
  return (
    <>
      <ReportViewed kind={view.kind} />
      <ReportBody view={view} pdfHref={`/r/${slug}/pdf`} siteUrl={publicEnv.siteUrl} />
    </>
  );
}

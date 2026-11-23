import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConsentError, ConsentScreen } from "@/components/oauth/consent";
import { OAuthFrame } from "@/components/oauth/frame";
import { previewDisabled } from "../report-preview/guard";

export const metadata: Metadata = { title: "OAuth consent preview (development)", robots: { index: false, follow: false } };

const BASE = { workspaceName: "Northgate Marketing", email: "owner@agency.example" };

/** Development only: the consent screen with invented data. ?v=web (default), local or error. */
export default async function OAuthPreview({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  if (previewDisabled()) notFound();
  const { v } = await searchParams;
  return (
    <OAuthFrame>
      {v === "error" ? (
        <ConsentError title="This connection link has expired" message="The app sent you here with a request that is more than ten minutes old, so nothing was shared." />
      ) : v === "local" ? (
        <ConsentScreen ticket="preview" view={{ ...BASE, clientName: "MCP Inspector", clientHost: null, selfAsserted: true, redirectTargets: ["localhost:6274"], localOnly: true }} />
      ) : (
        <ConsentScreen ticket="preview" view={{ ...BASE, clientName: "Claude", clientHost: "claude.ai", selfAsserted: true, redirectTargets: ["claude.ai"], localOnly: false }} />
      )}
    </OAuthFrame>
  );
}

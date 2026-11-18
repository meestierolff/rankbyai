import type { Metadata } from "next";
import Link from "next/link";
import { ApiReference } from "@/components/api-reference";
import { PageHeader, SecondaryLink } from "@/components/app/ui";
import { requireSession } from "@/lib/auth";
import { publicEnv } from "@/lib/env-public";

export const metadata: Metadata = { title: "API reference" };

export default async function Page() {
  await requireSession("/app/api/reference");
  return (
    <>
      <PageHeader
        title="API reference"
        description={<Link href="/app/developers" className="text-muted-foreground no-underline hover:text-fg">← API & MCP</Link>}
        actions={<SecondaryLink href="/api/v1/openapi.json">OpenAPI JSON</SecondaryLink>}
      />
      <p className="mt-0 mb-5 max-w-[760px] text-[14px] leading-normal text-muted-foreground">
        Base URL <code className="font-mono text-fg">{publicEnv.siteUrl}/api/v1</code>. Send your key as <code className="font-mono text-fg">Authorization: Bearer rbai_live_…</code>. Requests that cost money answer with <code className="font-mono text-fg">confirm_required</code> and an estimate until you send <code className="font-mono text-fg">confirm: true</code>. Limit: 60 requests a minute per key; the <code className="font-mono text-fg">X-RateLimit-Remaining</code> and <code className="font-mono text-fg">X-RateLimit-Reset</code> headers show where a key stands. Call the API from a server or a script: its endpoints send no CORS headers.
      </p>
      <ApiReference siteUrl={publicEnv.siteUrl} />
    </>
  );
}

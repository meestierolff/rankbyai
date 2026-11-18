import type { Metadata } from "next";
import Link from "next/link";
import { McpToolList } from "@/components/api-reference";
import { ApiKeys, Snippets, type KeyRow } from "@/components/app/developer-client";
import { PageHeader, Panel, SecondaryLink } from "@/components/app/ui";
import { mcpSnippets } from "@/lib/api-v1/snippets";
import { requireSession } from "@/lib/auth";
import { memberRead } from "@/lib/db/member-read";
import { publicEnv } from "@/lib/env-public";
import { FAIR_USE } from "@/lib/pricing-constants";

export const metadata: Metadata = { title: "API & MCP" };

export default async function Page() {
  const ctx = await requireSession("/app/developers");
  const wsId = ctx.workspace.id;
  // Workspace-filtered and read through memberRead: a failed read throws (error state).
  const { data } = await memberRead("API keys", wsId, (db) => db.from("api_keys").select("id, name, prefix, last_used_at, revoked_at, created_at").eq("workspace_id", wsId).order("created_at", { ascending: false }));
  return (
    <>
      <PageHeader
        title="API & MCP"
        description="Run everything in this app from your own scripts or from an AI agent. Every request that costs money returns an estimate first and runs only with confirm: true."
        actions={<><SecondaryLink href="/app/api/reference">API reference</SecondaryLink><SecondaryLink href="/api/v1/openapi.json">OpenAPI JSON</SecondaryLink></>}
      />
      <div className="flex flex-col gap-6">
        <Panel title="API keys">
          <ApiKeys keys={(data ?? []) as KeyRow[]} canManage={ctx.role === "owner"} locked={ctx.workspace.plan !== "lifetime"} limit={FAIR_USE.apiKeys} />
        </Panel>
        <Panel title="Connect an AI agent (MCP) or call the API">
          <p className="mt-0 mb-4 text-[14px] leading-normal text-muted-foreground">
            Replace <code className="font-mono text-fg">rbai_live_YOUR_KEY</code> with a key from above. The MCP server is at <code className="font-mono text-fg">{publicEnv.siteUrl}/api/mcp</code> (Streamable HTTP). Limit: 60 requests a minute per key.
          </p>
          <Snippets items={mcpSnippets(publicEnv.siteUrl)} />
        </Panel>
        <Panel title="MCP tools">
          <McpToolList />
          <p className="mt-4 mb-0 text-[13px] leading-normal text-dim">
            Tools marked “needs confirm” return the cost estimate when called without <code className="font-mono">confirm: true</code>, and do nothing else. See the <Link href="/app/api/reference" className="text-fg underline underline-offset-2">reference</Link> for the matching REST endpoints.
          </p>
        </Panel>
      </div>
    </>
  );
}

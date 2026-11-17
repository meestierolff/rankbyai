import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/marketing/page-shell";

export const metadata: Metadata = {
  title: "API and MCP documentation",
  description: "RankbyAI REST API and MCP server: run AI visibility grids, Maps grids, audits and prospect reports from your own scripts or AI agent.",
  alternates: { canonical: "/docs/api" },
};

export default function ApiDocsPage() {
  return (
    <ProsePage
      eyebrow="Developers"
      title="API and MCP documentation"
      updated="17 November 2026"
      intro="Every RankbyAI feature will be available over a REST API and an MCP server, so your own scripts or AI agent can run checks, audits and prospect reports."
    >
      <h2>Status</h2>
      <p>
        The API and MCP server are in development and ship during early access. This page will hold the full reference and the OpenAPI
        specification when they are live. Until then, nothing here is callable.
      </p>
      <h2>How it will work</h2>
      <ul>
        <li><strong>Authentication:</strong> an API key you create in the app, sent as a Bearer token. Keys are shown once and stored hashed.</li>
        <li><strong>Cost control:</strong> every request that costs money returns an estimate first and runs only with an explicit <code>confirm: true</code>.</li>
        <li><strong>REST:</strong> businesses, scans, scan points, compare, audits, Fix Kits, prospect batches and usage, under <code>/api/v1</code>.</li>
        <li><strong>MCP:</strong> a Streamable HTTP server at <code>/api/mcp</code> with the same tools, for Claude, Cursor and other MCP clients.</li>
      </ul>
      <p>See <Link href="/#pricing">pricing</Link> for what is included with lifetime access.</p>
    </ProsePage>
  );
}

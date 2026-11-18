import type { Metadata } from "next";
import Link from "next/link";
import { ApiReference, McpToolList } from "@/components/api-reference";
import { MCP_TOOLS } from "@/lib/api-v1/mcp-tools";
import { Eyebrow } from "@/components/brand/primitives";
import { PageShell } from "@/components/marketing/page-shell";
import { mcpSnippets } from "@/lib/api-v1/snippets";
import { publicEnv } from "@/lib/env-public";

export const metadata: Metadata = {
  title: "API and MCP documentation",
  description: "RankbyAI REST API and MCP server: manage businesses and run AI visibility grids, Google Maps grids, audits and prospect reports from your own scripts or AI agent.",
  alternates: { canonical: "/docs/api" },
};

const h2 = "m-0 text-[clamp(24px,3vw,34px)] leading-[1.1] font-semibold tracking-[-0.03em]";
const p = "m-0 max-w-[760px] text-[16px] leading-relaxed text-muted-foreground";
const code = "font-mono text-[14px] text-fg";

export default function ApiDocsPage() {
  const site = publicEnv.siteUrl;
  return (
    <PageShell>
      <article className="container-page flex flex-col gap-12 pt-[clamp(56px,8vw,104px)] pb-[var(--rb-section-y)]">
        <header className="flex max-w-[820px] flex-col gap-5">
          <Eyebrow>Developers</Eyebrow>
          <h1 className="m-0 text-[clamp(36px,5vw,60px)] leading-[1.05] font-semibold tracking-[-0.04em] text-balance">API and MCP documentation</h1>
          <p className="m-0 font-mono text-[13px] text-dim">Last updated 18 November 2026</p>
          <p className="text-lead m-0">
            The REST API and the MCP server cover the main work of the app: adding, updating and deleting businesses, AI visibility grids, Google Maps grids, comparing scans, audits, Fix Kits, prospect reports, white-label branding and usage. Your scripts or your AI agent can run them and read the results. Some things stay in the app, among them API keys, vendor keys, clients, schedules, the share link of a business, the logo, PDF downloads, and CSV import and export.
          </p>
        </header>

        <section className="flex flex-col gap-4" aria-labelledby="basics">
          <h2 id="basics" className={h2}>The basics</h2>
          <ul className="m-0 flex max-w-[760px] list-disc flex-col gap-2 pl-5 text-[16px] leading-relaxed text-muted-foreground">
            <li><strong className="text-fg">Base URL:</strong> <code className={code}>{site}/api/v1</code>. JSON in, JSON out.</li>
            <li><strong className="text-fg">Authentication:</strong> an API key you create in the app under API & MCP, sent as <code className={code}>Authorization: Bearer rbai_live_…</code>. A key is shown once and stored as a hash. Up to 5 keys per workspace.</li>
            <li><strong className="text-fg">You see the cost first:</strong> every request that calls a vendor answers with <code className={code}>confirm_required</code> and an estimate. It runs only when you repeat it with <code className={code}>confirm: true</code>.</li>
            <li><strong className="text-fg">Rate limit:</strong> 60 requests a minute per key. Every authenticated response carries <code className={code}>X-RateLimit-Limit</code>, <code className={code}>X-RateLimit-Remaining</code> and <code className={code}>X-RateLimit-Reset</code> (a Unix time in seconds). Over the limit you get <code className={code}>429</code> with a <code className={code}>Retry-After</code> header in seconds.</li>
            <li><strong className="text-fg">Server-side only; no CORS:</strong> call the API from a server, a script or an agent. The endpoints send no CORS headers, so a browser on another website cannot call them, and an API key does not belong in browser code. The OpenAPI document holds no account data and is the one address any website may read.</li>
            <li><strong className="text-fg">Money:</strong> amounts are US dollars, rounded to at most 6 decimal places. Estimates use <code className={code}>totalUsd</code> and <code className={code}>lines</code>. The business-lookup and Fix Kit estimates also carry the older <code className={code}>total_usd</code> for one more release.</li>
            <li><strong className="text-fg">Ids and methods:</strong> ids are UUIDs; an id in another form answers <code className={code}>400</code>, an id that does not exist in your workspace <code className={code}>404</code>. A method an endpoint does not serve answers <code className={code}>405</code> with an <code className={code}>Allow</code> header. <code className={code}>HEAD</code> works wherever <code className={code}>GET</code> does.</li>
            <li><strong className="text-fg">Paying for scans:</strong> <code className={code}>funding: &quot;byok&quot;</code> uses your own API keys at cost; <code className={code}>funding: &quot;credits&quot;</code> uses included scans.</li>
            <li><strong className="text-fg">OpenAPI 3.1:</strong> <a href="/api/v1/openapi.json" className="text-fg underline underline-offset-2">/api/v1/openapi.json</a>.</li>
          </ul>
          <p className={p}>AI answers vary between runs, places and time; API results can differ from what people see in the consumer apps. Lifetime access is needed to run scans; see <Link href="/#pricing" className="text-fg underline underline-offset-2">pricing</Link>.</p>
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="mcp">
          <h2 id="mcp" className={h2}>MCP server</h2>
          <p className={p}>
            The MCP server is at <code className={code}>{site}/api/mcp</code> and uses the same API key. It has {MCP_TOOLS.length} tools. Tools marked “needs confirm” return the estimate when called without <code className={code}>confirm: true</code> and do nothing else, so an agent has to show you the cost before it can spend anything.
          </p>
          <p className={p}>
            Transport: stateless Streamable HTTP, POST only. Each POST is answered on its own. There are no sessions (no <code className={code}>Mcp-Session-Id</code>) and no GET notification stream, so <code className={code}>GET</code> answers <code className={code}>405</code> and the server does not announce changes to its tool list. Results come as <code className={code}>structuredContent</code> and as the same JSON in a text block.
          </p>
          <div className="rounded-2xl border border-border bg-surface p-5"><McpToolList /></div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {mcpSnippets(site).map((s) => (
              <div key={s.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
                <span className="text-[16px] font-semibold">{s.title}</span>
                <span className="text-[13px] text-dim">{s.where}</span>
                <pre tabIndex={0} className="m-0 overflow-auto rounded-lg bg-bg p-3 font-mono text-[13px] leading-relaxed text-fg-2">{s.code}</pre>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="reports">
          <h2 id="reports" className={h2}>Share links and PDFs of prospect reports</h2>
          <p className={p}>
            <code className={code}>GET /api/v1/prospects/{"{id}"}</code> (MCP: <code className={code}>get_prospect_batch</code>) lists the reports of a batch. Each finished report has <code className={code}>report_url</code>: its live share link, which anyone with the link can open and which shows your white-label branding. The PDF of a report is downloaded in the app, on the batch page under Prospects; the API does not serve PDF files.
          </p>
          <p className={p}>
            Deleting a business (<code className={code}>DELETE /api/v1/businesses/{"{id}"}</code>, MCP: <code className={code}>delete_business</code>) is free and needs no confirm. It also deletes the scans, audits, Fix Kits, schedules and reports of that business, its share links stop working, and it cannot be undone.
          </p>
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="reference">
          <h2 id="reference" className={h2}>REST reference</h2>
          <ApiReference siteUrl={site} />
        </section>
      </article>
    </PageShell>
  );
}

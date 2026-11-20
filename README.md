# RankbyAI

**AI visibility software you pay for once.** RankbyAI shows whether ChatGPT, Perplexity and Gemini recommend a local business for "best {service} near me" prompts, point by point across a map grid, next to its Google Maps rank on the same grid. Scans run on the user's own API keys at cost, or on optional included-scan packs.

Live site: https://rankbyai.live · Built in public for the Ship or Die $100K Hackathon (16 Nov – 16 Dec 2026).

> Not affiliated with or endorsed by OpenAI, Perplexity, Google or DataForSEO. RankbyAI is not the first or only AI visibility grid tool; Local Falcon and BrightLocal also offer one. The difference is how you pay.

## MCP server

RankbyAI is a remote [Model Context Protocol](https://modelcontextprotocol.io) server, so AI assistants can add businesses, run AI and Google Maps grids, audit a business and build its Fix Kit for the user.

- **Endpoint:** `https://rankbyai.live/api/mcp`, Streamable HTTP, stateless (POST only; no `Mcp-Session-Id`, so `GET` answers `405`).
- **Tools:** 20, plus one prompt, `fix_plan`. Every tool that costs money returns its estimate first and runs only with `confirm: true`.
- **Limit:** 60 requests a minute per API key or connected app.

### Authentication

Both ways use `Authorization: Bearer …`.

1. **OAuth 2.1 sign-in (for Claude, ChatGPT, Cursor, Gemini CLI and other MCP clients).** The client needs only the URL. A request without a token gets `401` with `WWW-Authenticate: Bearer resource_metadata="https://rankbyai.live/.well-known/oauth-protected-resource/api/mcp", scope="mcp"`. The client reads the [protected resource metadata](https://rankbyai.live/.well-known/oauth-protected-resource) and the [authorization server metadata](https://rankbyai.live/.well-known/oauth-authorization-server), and registers itself with dynamic client registration (`/oauth/register`) or a Client ID Metadata Document. It then opens `/oauth/authorize`, where the user signs in with their RankbyAI (Google) account and the workspace owner approves the app.
   - Authorization code with PKCE `S256` only, and `iss` on every authorization response (RFC 9207).
   - The one scope is `mcp`. Tokens are bound to `https://rankbyai.live/api/mcp` (RFC 8707) and to the approved workspace.
   - Access tokens last one hour. Refresh tokens last 30 days and rotate on every use; replaying an old one revokes its family.
   - Revocation is at `/oauth/revoke` (RFC 7009). Owners also see and disconnect apps under **API & MCP** in the app.
   - OAuth tokens never open the REST API, and no token or response ever contains the user's stored vendor API keys.
   - The OAuth endpoints are live once the deployment has `MCP_OAUTH=1` (after migration `db/migrations/0012_mcp_oauth.sql`).
2. **API key (for scripts and clients without sign-in).** Create one in the app under **API & MCP**, and send it as `Authorization: Bearer rbai_live_…`. These are the same keys as the REST API (see [/docs/api](https://rankbyai.live/docs/api)).

### Tools

| Tool | What it does | Hints |
|---|---|---|
| `list_businesses` | List the workspace's businesses | read-only |
| `add_business` | Track a business (Google Maps lookup needs `confirm`) | adds, open world |
| `update_business` | Change name, address, client, map point or language | destructive (overwrites) |
| `delete_business` | Delete a business with its scans, audits and reports | destructive |
| `estimate_scan` | Cost of an AI or Maps scan, without running it | read-only |
| `run_ai_scan` | Ask ChatGPT, Perplexity and Gemini at every grid point (paid, `confirm`) | adds, open world |
| `run_maps_scan` | Google Maps rank at every grid point (paid, `confirm`) | adds, open world |
| `list_scans`, `get_scan`, `compare_scans` | Scans, their points and answers, and before/after comparisons | read-only |
| `run_audit` | Local AI Audit against the map pack (paid, `confirm`) | adds, open world |
| `list_audits`, `get_audit` | Audits, findings P0 to P3 with evidence | read-only |
| `get_fix_kit` | Copy-ready fixes for a finished audit (built once) | adds, idempotent, open world |
| `create_prospect_batch` | Prospect reports for agencies (paid, `confirm`) | adds, open world |
| `list_prospect_batches`, `get_prospect_batch` | Prospect batches and their report links | read-only |
| `get_branding`, `update_branding` | White-label branding on reports | read-only / destructive (overwrites) |
| `get_usage` | This month's own-key spend and credits left | read-only |

Every tool carries MCP annotations: `title`, `readOnlyHint`, `destructiveHint` and `openWorldHint`, plus `idempotentHint` on the tools that change something. The source of truth is `MCP_TOOL_HINTS` in `src/lib/api-v1/mcp-tools.ts`.

### Connect a client

**Claude (claude.ai and Claude Desktop):** Settings → Connectors → Add custom connector, paste `https://rankbyai.live/api/mcp`, then Connect and sign in.

**ChatGPT:** create an app or connector in developer mode with the URL `https://rankbyai.live/api/mcp` and OAuth authentication; ChatGPT registers itself and opens the RankbyAI sign-in.

**Cursor** (`~/.cursor/mcp.json`; Cursor signs in with OAuth by itself):

```json
{
  "mcpServers": {
    "rankbyai": { "url": "https://rankbyai.live/api/mcp" }
  }
}
```

With an API key instead:

```json
{
  "mcpServers": {
    "rankbyai": { "url": "https://rankbyai.live/api/mcp", "headers": { "Authorization": "Bearer rbai_live_YOUR_KEY" } }
  }
}
```

**Claude Code:**

```bash
claude mcp add --transport http rankbyai https://rankbyai.live/api/mcp          # then /mcp to sign in
claude mcp add --transport http rankbyai https://rankbyai.live/api/mcp \
  --header "Authorization: Bearer rbai_live_YOUR_KEY"                          # or with an API key
```

**Gemini CLI:** `gemini extensions install https://github.com/meestierolff/rankbyai` (the manifest is [`gemini-extension.json`](gemini-extension.json)).

**Grok:** at grok.com/connectors → New Connector → Custom, paste `https://rankbyai.live/api/mcp`. Through the xAI API, add it as a remote MCP tool with an API key:

```json
{ "type": "mcp", "server_url": "https://rankbyai.live/api/mcp", "server_label": "rankbyai", "authorization": "rbai_live_YOUR_KEY" }
```

**Claude Code and Codex plugin** (MCP server plus the RankbyAI skill, in [`plugins/rankbyai`](plugins/rankbyai)):

```bash
claude plugin marketplace add meestierolff/rankbyai && claude plugin install rankbyai@rankbyai
codex plugin marketplace add meestierolff/rankbyai
```

### Directory listings

- [`server.json`](server.json): the entry for the official MCP Registry, named `io.github.meestierolff/rankbyai`, with one `streamable-http` remote. To publish, run `mcp-publisher login github` as `meestierolff`, then `mcp-publisher publish`.
- [`gemini-extension.json`](gemini-extension.json): the Gemini CLI extension. The gallery lists repositories that carry the `gemini-cli-extension` topic.
- [`plugins/rankbyai`](plugins/rankbyai): the plugin for Claude Code, the Claude directory and Grok Build (`.claude-plugin/plugin.json`, `.mcp.json`, `skills/rankbyai/SKILL.md`). Marketplaces: [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) (Claude Code) and [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json) (Codex).
- [`plugins/openai`](plugins/openai): the OpenAI plugin directory manifests; `node scripts/build-openai-plugin.mjs --demo-url <recording>` builds the ZIP to upload (without `--demo-url` it builds a draft; the recording is then entered under Review details before Submit for review). Domain verification is served at `/.well-known/openai-apps-challenge` from `OPENAI_APPS_CHALLENGE`.
- Support: [rankbyai.live/support](https://rankbyai.live/support) (mees@rankbyai.live). Privacy: [/privacy](https://rankbyai.live/privacy). Terms: [/terms](https://rankbyai.live/terms).

## Stack

- Next.js 16 (App Router, Cache Components, TypeScript strict), Tailwind CSS v4, shadcn/ui
- Neon (Postgres, Neon Auth with Google sign-in, Data API, Object Storage) with row level security on every table
- Stripe Checkout (one-time payments, Stripe Tax)
- Official APIs only: DataForSEO (Google Maps results), OpenAI, Perplexity, Gemini
- Vitest for unit and database tests

## Repository map

| Path | What it holds |
|---|---|
| `design/` | Design handoff (source of truth for the look) |
| `src/styles/tokens.css`, `src/app/globals.css` | Design tokens and the Tailwind theme |
| `src/components/ui`, `src/components/brand` | shadcn/ui primitives and the brand component library |
| `src/components/marketing`, `src/app/(marketing)` | Marketing site |
| `src/app/app`, `src/components/app` | The dashboard |
| `src/lib/pricing-constants.ts`, `src/lib/cost` | Vendor price constants and cost maths (one source for site and app) |
| `src/lib/ladder.ts`, `src/lib/checkout.ts`, `src/lib/stripe-webhook.ts` | Lifetime price ladder, checkout, webhook |
| `db/migrations` | Schema, RLS policies, functions (plain Postgres SQL) |
| `db/local`, `scripts/db.mjs` | Local database stack (Postgres + PostgREST in Docker) and the migration runner |
| `src/lib/db` | Database clients and the short-lived tokens the server signs for the Data API |
| `src/lib/api-v1`, `src/app/api/mcp` | REST API, OpenAPI document and the MCP server (tools, annotations) |
| `src/lib/oauth`, `src/app/oauth`, `src/app/.well-known` | OAuth 2.1 authorization server for the MCP server: metadata, registration, consent, tokens |
| `tests/unit`, `tests/db` | Unit tests and tests that run against a real local Postgres |
| `docs/` | Setup, progress log, vendor API notes |

## Run it locally

```bash
pnpm install
cp .env.example .env.local
pnpm db:setup            # local Postgres + PostgREST (Docker): creates a signing key, writes the database lines to .env.local, applies db/migrations
pnpm dev                 # http://localhost:3100
```

```bash
pnpm test                # unit + database tests (local database only)
pnpm build && pnpm check:secrets   # production build, then scan client bundles for secrets
```

See [docs/SETUP.md](docs/SETUP.md) for every environment variable and the hosted setup, and [docs/PROGRESS.md](docs/PROGRESS.md) for what is built and verified.

## Rules this codebase keeps

- Row level security on every table; an automated test proves it.
- API keys are encrypted with AES-256-GCM, write-only, and used only on the server.
- No scraping. Official APIs only. Every AI result carries the "AI answers vary" disclaimer.
- No invented numbers: demo content is labelled "Sample data", estimates are labelled as estimates, competitor prices carry their source date.
- No fake urgency: the price follows a public sales counter, never a timer.
- Every sale is priced above its delivery cost (asserted in `tests/unit/pricing.test.ts`).

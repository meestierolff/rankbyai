---
name: rankbyai
description: >-
  RankbyAI agent skill: measure whether ChatGPT, Perplexity and Gemini recommend a local business
  at each point of a map grid, next to its Google Maps rank at the same points, through the
  RankbyAI MCP server. Use when the user asks about local AI visibility, "does ChatGPT recommend
  my client", map rank grids, a Local AI Audit, a weekly "why it changed" note, prospect reports or
  an email teaser for a lead, which pages (listicles, reviews, directories) the AI answers cite for
  buyer prompts, or asks you to fetch https://rankbyai.live/SKILL.md. Fetch this file
  before quoting tool names, call order or costs from memory.
version: 1.2.0
homepage: https://rankbyai.live/SKILL.md
metadata:
  version: 1.2.0
  author: RankbyAI
  source: https://rankbyai.live/SKILL.md
  site: https://rankbyai.live
  docs: https://rankbyai.live/docs/api
  mcp: https://rankbyai.live/api/mcp
  llms: https://rankbyai.live/llms.txt
---

# RankbyAI: local AI visibility grid, agent skill

**Start here:** you are reading `https://rankbyai.live/SKILL.md` (UTF-8 Markdown). Do not guess the MCP URL, tool names or costs. The file is complete only if the **last line** is `END SKILL v1.2.0`. If it is missing, fetch the file again.

## TL;DR

- **What it measures:** at every point of a grid around a local business, whether ChatGPT, Perplexity and Gemini name it when asked for a "{service} near me" recommendation (position, who they name instead, which sources they cite), and the business's Google Maps rank at the same kind of grid. Plus a Local AI Audit (score 0 to 100, findings P0 to P3 with evidence and a fix) and a Fix Kit.
- **MCP URL:** `https://rankbyai.live/api/mcp` (Streamable HTTP, stateless, POST only).
- **Auth:** sign in with OAuth 2.1 from the MCP client (preferred for Claude, ChatGPT and Cursor), or send an API key `Authorization: Bearer rbai_live_…` that the user creates in the app under Developers → API & MCP. OAuth tokens work only on the MCP server; the REST API (`https://rankbyai.live/api/v1`) takes API keys only.
- **Rate limit:** 60 requests a minute per API key or OAuth connection. On `429`, wait and continue.
- **Money:** tools that call a paid vendor return an estimate and do nothing else until called again with `confirm: true`. Always show the user the estimate and get a yes first.
- **Truth:** every rank, mention, name, source, score and cost you report is copied from tool JSON. If a field is missing, say so.

## Connect (once)

Claude Code:

```bash
claude mcp add --transport http rankbyai https://rankbyai.live/api/mcp
```

Then run `/mcp` and sign in.

Cursor (`.cursor/mcp.json` in the project, or `~/.cursor/mcp.json`), URL only; Cursor asks you to sign in:

```json
{
  "mcpServers": {
    "rankbyai": {
      "url": "https://rankbyai.live/api/mcp"
    }
  }
}
```

Claude (web and desktop): Settings → Connectors → Add custom connector, paste the URL, Connect. ChatGPT: an app or connector in developer mode with the URL and OAuth. Other clients: add the URL; with an API key instead of OAuth, send the `Authorization: Bearer rbai_live_…` header.

If the tools are missing, ask the user to connect. A `401` means the sign-in ended or the key was revoked: ask the user to reconnect. Tools only see the user's own workspace.

## Paid tools (estimate first, confirm second)

`add_business` (only for a Google Maps lookup by name and city; with lat and lng it is free), `run_ai_scan`, `run_maps_scan`, `run_consistency_check`, `run_audit`, `get_fix_kit` (the first build, on the user's own keys), `create_prospect_batch` and `run_prompt_pack` (the user's own keys only; its estimate also lists `missing_keys`).

1. Call `estimate_scan` (for scans) or the tool itself without `confirm`. You get `confirm_required` and an `estimate` (`totalUsd`, `credits`, `lines`).
2. Show the user the total, what runs (grid size, engines, keyword) and who pays: `funding: "byok"` (the default) bills the user's own vendor keys; `funding: "credits"` uses included scan credits.
3. Only after the user agrees, call again with `confirm: true`.

Never run a paid tool on your own initiative, never repeat a confirmed call to retry silently, and never state a cost that is not in an `estimate` or in `get_usage`.

## Call order

1. **`list_businesses`**: find the business id. Never invent an id. If it is not tracked, `add_business` with `lat` and `lng` (free) or `name` and `city` (paid lookup: estimate, then confirm).
2. **`estimate_scan`** with `kind: "ai"` (grid 1, 3 or 5) and/or `kind: "maps"` (grid 3 to 15). Show the estimate.
3. **`run_ai_scan`** and/or **`run_maps_scan`** with `confirm: true` after the user agrees. Same `keyword` (the service, e.g. "dentist"). Default radius 2 miles for a city business; 5 to 10 for a service-area business.
4. **`get_scan`** every 20 to 30 seconds until `status` is `done` or `partial` (`partial`: some points or engines failed; report what finished). A scan whose `consistency_run.role` is `A2`, `B1` or `B2` is a repeat or second-language run of a consistency check, and a scan with a `prompt_pack_run` asked one buyer prompt of a prompt pack: never present either as the business's latest scan (read packs with `get_prompt_pack`). `include_points: true` returns each point's Maps rank, or each engine's answer with `mentioned`, `mention_position`, `named_businesses` and `sources`.
5. After a later re-check of the same scan: **`get_change_note`** (`business_id`, or scan ids `a` and `b`) for what changed in mentions, positions, names and cited sources; **`compare_scans`** for per-point changes. `get_change_note` never runs a scan; if it says there are no two comparable scans, offer to run or schedule one (estimate first).
6. Before claiming a change or a language effect: **`run_consistency_check`** (paid: runs × one grid's estimate; `repeat: 2` asks the same question twice, `second_language` adds a question in another language with the service as people say it there), then poll **`get_consistency`** with the `group_id`. Report `stability_rate` (share of mention decisions that agreed) per pair, and the names in both runs or only one. A language difference only counts when it is larger than the difference between two runs of the same question.
7. **`run_audit`** with the main `service` (paid: estimate, then confirm), poll **`get_audit`** until `done`, then the **`fix_plan`** prompt for a prioritised plan, then **`get_fix_kit`** for copy-ready text (description, FAQs, LocalBusiness and FAQPage JSON-LD, an llms.txt draft).
8. Agencies finding clients: **`create_prospect_batch`** (paid), poll **`get_prospect_batch`** (5 to 10 minutes), then **`get_pitch_asset`** (`batch_id`, `business_id`) for a short email teaser, a comparison image and the report link. RankbyAI never sends email: hand the text to the user.
9. Citation workflow, for which pages the answers lean on: **`get_buyer_prompts`** (`business_id`; about ten prompts from stored fields, free) → show them and let the user edit, add or remove prompts → **`run_prompt_pack`** without `confirm` (estimate: prompts × repeats × one AI scan, with `alternatives` for the map point and the grids) → with `confirm: true` after the user agrees → poll **`get_prompt_pack`** (`pack_id`) until the run is `done` or `partial` → **`list_cited_sources`** (`pack_id`; `missing_only: true` for the pages that leave the business out). Default to `location: "pin"` and `repeats: 1`; suggest `repeats: 2` for a baseline the user will compare against later. `pack_id` on `run_prompt_pack` runs a saved pack again.
10. **`get_usage`** shows this month's spend on the user's own keys and the credits left. `list_scans`, `list_audits`, `list_prospect_batches` and `list_prompt_packs` find earlier work. `get_branding` shows the white-label name, colour and logo used on reports.

Do not call `update_business`, `delete_business` or `update_branding` unless the user asked for that exact change. `delete_business` cannot be undone.

## Reading results

- **AI scan:** points where at least one engine named the business (`points_mentioned` of `points`), per engine `mention_rate` and `avg_position`, `top_competitors` (named instead), `top_sources` (cited domains). Missing points and who is named there are the most useful finding.
- **Maps scan:** `avg_rank` (outside the top 20 counts as 21), `top3_points` of `points_done`. Top 3 only near the business's door is a proximity-only footprint.
- **Audit:** `score` from the checks that ran; `not_checked` lists checks that could not run, with the reason. Never treat a not-checked item as passed or failed. Work P0 first (identity, and whether search engines and AI crawlers may read the site), then P1, P2, P3.
- **Crawler findings** (`check_key` `ai_crawlers` or `crawler_http`) carry `crawlers[]`: per crawler `purpose` (`search` should usually be allowed; `training` the business may choose to block), `evidence`, `cause`, `confidence`, `where_to_look`, `steps` and a `verify` command. Say "robots.txt says" for `high`, "likely" for `medium`, "possible" for `low`. Never present a medium or low cause as certain, and never recommend blocking search or AI search crawlers.
- **Cited sources:** `page_type` comes from the address and title only (`type_confidence` says how sure); there is no authority or traffic figure. `missing.basis` is `page` when RankbyAI read the page and the business is not on it, `answers` when only the answers that cited it were counted. Say which. `disappeared_on` is the first run after the page was last cited.
- AI answers vary between runs, places and time, and API answers can differ from the consumer apps. Report them as dated observations, never as a fixed ranking or a prediction.

## Output template

Fill it from tool JSON only. Leave out a line whose data is missing and say it is missing.

```
RankbyAI · <business> · "<keyword>" · checked <scan date>
AI: named at <points_mentioned>/<points> points (<engine>: <mention_rate>, avg position <avg_position>; ...)
Google Maps: top 3 at <top3_points>/<points_done> points, average rank <avg_rank>

| Point | Area  | Maps rank | ChatGPT       | Perplexity | Gemini    |
|-------|-------|-----------|---------------|------------|-----------|
| <idx> | <label> | #<rank> or 20+ | #<position> / not named / no answer | ... | ... |

Named instead: <name> (<mentions>), ...
Most-cited sources: <domain> (<count> answers; <engines>), ...
Audit <score>/100. Fix first:
| Priority | Finding | Evidence | Fix |
|----------|---------|----------|-----|
| P0 | <title> | <evidence label: value> | <fix> |

AI answers vary between runs, places and time; this is what they said on <date>.
```

Use the per-point table only when the AI and Maps scans used the same `grid_size` and `radius_miles` and their points have the same `lat` and `lng` (from `get_scan` with `include_points: true`); otherwise give the two summaries side by side.

## Checklist

- [ ] This file loaded completely (last line is the END marker)
- [ ] MCP connected (or the user told how to connect)
- [ ] Business id from `list_businesses` or `add_business`, never invented
- [ ] Estimate shown and the user said yes before every `confirm: true`
- [ ] Scan status checked with `get_scan` before reading results
- [ ] Every number, name, URL and cost copied from tool JSON
- [ ] Not-checked audit items reported as not checked
- [ ] Crawler causes worded by their confidence
- [ ] A one-run difference reported as an observation, not a stable ranking

## Do not

- Invent ranks, mention counts, positions, business names, cited URLs, scores, costs or dates
- Spend money (`confirm: true`) without the user's yes on the estimate
- Send email, post publicly, or contact a business: RankbyAI does not, and outreach is the user's own
- Suggest keywords or a city in the Google Business Profile name (unless it is the registered name), buying or gating reviews, fake listings or locations, fake clicks, link schemes, or blocking search or AI search crawlers
- Promise rankings or AI recommendations
- Call `update_business`, `delete_business` or `update_branding` unless asked
- Scrape the website or a search engine when a tool returns no data: say what is missing

END SKILL v1.2.0

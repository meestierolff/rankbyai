---
name: rankbyai
description: Use the RankbyAI MCP tools to check whether ChatGPT, Perplexity, Gemini and Google Maps recommend a local business, point by point on a map grid, and to turn the results into a prioritised fix plan. Use when the user asks about AI visibility, AI search, local SEO, map rank grids, or whether AI assistants recommend their own or a client's business.
---

# RankbyAI

RankbyAI asks AI assistants (ChatGPT, Perplexity, Gemini) "who are the best {service} near me?" from every point of a grid around a business, reads the business's Google Maps rank on the same kind of grid, and audits why it does or does not get named. These instructions cover how to use its MCP tools well.

## Before you start

- The `rankbyai` MCP server must be connected (sign in when the client asks, or use an API key from the RankbyAI app under API & MCP). If its tools are missing, ask the user to connect it.
- Everything happens in the user's own RankbyAI workspace. Tools only see that workspace.

## Costs: always ask first

Six tools can spend money: `add_business` (Maps lookup), `run_ai_scan`, `run_maps_scan`, `run_audit`, `get_fix_kit` (first build) and `create_prospect_batch`.

1. Call the tool **without** `confirm` (or use `estimate_scan`). It returns the estimate and does nothing else.
2. Show the user the cost and what will run (grid size, engines, keyword).
3. Only after the user agrees, call it again with `confirm: true`.

`funding` decides who pays: `byok` (default) runs on the user's own vendor keys at cost; `credits` uses included scan credits. `get_usage` shows this month's spend and the credits left. Never run a paid tool on your own initiative.

## Typical flow

1. `list_businesses`, or `add_business` (name and city, or lat/lng).
2. `estimate_scan`, then `run_ai_scan` and `run_maps_scan` with `confirm: true` after the user agrees. A 3×3 AI grid and a 7×7 Maps grid are good defaults; 2 miles suits a city business, 5 to 10 miles a service-area business.
3. Poll `get_scan` every 20 to 30 seconds until `status` is `done` (or `partial`). Use `include_points: true` for every point's answer, the businesses each engine named instead, and the sources it cited.
4. `run_audit` (with the main service, e.g. "dentist"), poll `get_audit`, then `get_fix_kit`.
5. Later: run the same scan again and use `compare_scans` to show what changed.

Agencies can use `create_prospect_batch` (niche and city, or named businesses) to build reports for potential clients; `get_prospect_batch` returns each report's share link.

## Reading the results

- **AI scans:** at how many points at least one engine named the business, each engine's mention rate and average position, and the share of AI voice (its mentions divided by all business mentions). Points where it is missing, and who is named there instead, are the most useful finding.
- **Maps scans:** average rank (outside the top 20 counts as 21), top-3 share, and where it appears in the top 20. Ranks usually fall with distance; top 3 only near the business's own door is a proximity-only footprint.
- **Audit:** a 0 to 100 score from the checks that could run, with findings P0 to P3, each with its evidence. Checks that could not run are listed, never guessed.
- AI answers vary between runs, places and time, and API results can differ from what people see in the consumer apps. Report them as observations from a date, not as guarantees or predictions.

## Turning an audit into a plan

Use the `fix_plan` prompt with the audit id, or follow the same order:

1. **P0** first: the business's identity (name, address and phone matching between Google profile, website and schema) and whether search engines and AI crawlers may read the site.
2. **P1:** gaps against the map pack (reviews, service pages competitors have).
3. **P2:** profile details, pages, schema, FAQ, llms.txt (the Fix Kit has copy-ready drafts).
4. **P3:** nice to have.

RankbyAI does not change listings or websites; the user (or their developer) applies the fixes.

## Guardrails

Never suggest:

- adding keywords or a city to the Google Business Profile name unless it is the registered business name;
- buying, gating or incentivising reviews, or asking only happy customers;
- fake listings, or second locations that are not real staffed places;
- fake clicks or visits, or link schemes;
- blocking search engines or AI search crawlers.

Use only facts from the audit, the business's own website, or the user.

## When something fails

- A run tool that answers that the workspace cannot run it: tell the user what it said; read tools keep working.
- `429` / rate limit: 60 requests a minute; wait and continue.
- `401`: the connection ended or the key was revoked; ask the user to reconnect.

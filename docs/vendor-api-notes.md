# [CONFIRM] findings — checked against live docs on 17 Nov 2026

How this was checked: Firecrawl was out of credits, so every page was fetched directly (`curl`, mostly the vendors' own `.md` / `llms.txt` renderings) and read verbatim. Quotes below are copied from those fetched pages. Nothing here was executed against a paid API; where a claim rests on my own combination of documented pieces rather than a doc example, it is labelled **derived**. Three harmless probes with an invalid key were made (Gemini models list, Perplexity `/v1/models`, Perplexity `/v1/agent`) and are labelled **live probe**.

## Contradictions with the spec (read these first)

| # | Spec assumption | What the docs say now |
|---|---|---|
| 1 | `gpt-5-mini` is the model | Exists and supports `web_search`, but is **Deprecated and shuts down 11 Dec 2026**. Use `gpt-6-luna` ($0.10 / $0.50). |
| 2 | Perplexity `perplexity/sonar` + `web_search` tool | Model id exists and the tool shape is right, but **no doc example pairs them**; Perplexity's migration guide maps `sonar` to `effort: "fast"`, which runs `openai/gpt-6-luna` + `web_search` fast at `max_steps: 1`, not `perplexity/sonar`. |
| 2 | Free endpoint to validate a Perplexity key | Docs say `GET /v1/models` needs **no** auth; a live probe without a key returned **401**. Unresolved. |
| 3 | `generateContent` + `googleMaps` | Still documented and correct, but Google now labels `generateContent` **legacy**; default docs use the Interactions API with a different tool shape. |
| 3 | Maps grounding on free tier | **"Not available"** on the free tier for Gemini 3+ models (paid tier gets 5,000 free/month). |
| 3 | REST name for search grounding | Docs REST example uses **`google_search`** (snake_case), while Maps uses `googleMaps` (camelCase). |
| 5 | `@modelcontextprotocol/sdk` + `WebStandardStreamableHTTPServerTransport` | That is the **legacy v1 line**. Current is **`@modelcontextprotocol/server` 2.4.0** with `createMcpHandler`. |
| 7 | `export const revalidate` for ISR | **Removed when `cacheComponents` is enabled**; still valid without it. |
| 7 | Supabase anon key env name | Docs now use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; `setAll` takes a second `headers` argument. |
| 8 | OpenFreeMap `/styles/dark` | Exists. The "3D" style shown on the site has **no working style URL I could find** (two guesses returned 404). |
| 8 | Nominatim / Overpass for a commercial app | Nominatim forbids "reverse queries in a grid"; Overpass wiki says "Commercial use should use self-hosted or paid Overpass servers". |

---

## 1. OpenAI Responses API + `web_search`

Sources:
- https://platform.openai.com/docs/guides/tools-web-search (served from https://developers.openai.com/api/docs/guides/tools-web-search.md)
- https://developers.openai.com/api/reference/resources/responses/methods/create.md
- https://platform.openai.com/docs/pricing (served from https://developers.openai.com/api/docs/pricing.md)
- https://developers.openai.com/api/docs/models/gpt-5-mini.md , `/gpt-5-nano.md` , `/gpt-6-luna.md`
- https://developers.openai.com/api/docs/deprecations.md

### (a) Request body — CONFIRMED

Doc example (verbatim, model swapped by the docs to their current flagship):

```bash
curl "https://api.openai.com/v1/responses" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -d '{
        "model": "gpt-6-astra",
        "tools": [{
            "type": "web_search",
            "user_location": {
                "type": "approximate",
                "country": "GB",
                "city": "London",
                "region": "London"
            }
        }],
        "input": "What are the best restaurants near me?"
    }'
```

`user_location` fields from the API reference: `city` (free text), `country` ("two-letter ISO country code"), `region` (free text), `timezone` (IANA), `type: optional "approximate" (default: "approximate")`.

Worth knowing: "The approximate location of the user. If omitted or null, defaults to the United States. To avoid this fallback, pass `{"type": "approximate"}` without location fields."

Other tool options: `search_context_size: "low" | "medium" | "high"` (default medium), `filters.allowed_domains` / `blocked_domains` (up to 100), `external_web_access` (default true), `return_token_budget`.

`tool_choice: "required"` — CONFIRMED valid. Reference: `ToolChoiceOptions = "none" or "auto" or "required"`. Guide: "With `tool_choice: "auto"`, search is optional. Use `tool_choice: "required"` or a specific web search tool choice when search must run."

Caveat: the hosted-tool form (`tool_choice: {type: ...}`) lists `web_search_preview` in the reference section I read, not `web_search`. Only the string `"required"` is confirmed for the non-preview tool.

Tool type: use `web_search`. "For new Responses API integrations, use `{ "type": "web_search" }`. The earlier `web_search_preview` tool remains available for legacy integrations".

### (b) Model — CONTRADICTS the spec

`gpt-5-mini` exists and lists `web_search` under "Supported tools", but its model page says "Status: Deprecated", and the deprecations table reads:

> | **Dec 11, 2026** | `gpt-5-mini`, `gpt-5-mini-2025-08-07` | Deprecated | `gpt-6.1-terra` | Jun 11, 2026 |
> | **Dec 11, 2026** | `gpt-5-nano`, `gpt-5-nano-2025-08-07` | Deprecated | `gpt-6-luna` | Jun 11, 2026 |

That is 24 days from today. Do not build on it.

Cheapest current (non-deprecated) model that supports `web_search`: **`gpt-6-luna`** — "Our most efficient model for focused, high-volume tasks." Its page lists `web_search` under both "Supported features" and "Supported tools", and says "Use the Responses API for built-in tools and function calling." `reasoning.effort` supports `none`, `low`, `medium` (default), `high`, `xhigh`, `max`.

Note: "For integrations still using `gpt-5`, web search requires reasoning effort above `minimal`." No equivalent restriction is stated for `gpt-6-luna`; whether `reasoning.effort: "none"` works with web search on OpenAI's own API is UNCONFIRMED (the only related OpenAI note is that `gpt-5.4` with effort `none` "may produce lower-quality results"). Indirect evidence: Perplexity's `fast` effort level runs `openai/gpt-6-luna` with `reasoning.effort: "none"` and a web search tool, but that is Perplexity's search tool, not OpenAI's.

### (c) Response shape — CONFIRMED

```json
[
  {
    "type": "web_search_call",
    "id": "ws_67c9fa0502748190b7dd390736892e100be649c1a5ff9609",
    "status": "completed",
    "action": { "type": "search", "query": "latest news about AI" }
  },
  {
    "id": "msg_67c9fa077e288190af08fdffda2e34f20be649c1a5ff9609",
    "type": "message",
    "status": "completed",
    "role": "assistant",
    "content": [
      {
        "type": "output_text",
        "text": "On March 6, 2025, several news...",
        "annotations": [
          { "type": "url_citation", "start_index": 2606, "end_index": 2758, "url": "https://...", "title": "Title..." }
        ]
      }
    ]
  }
]
```

- Answer text: `output[]` item with `type: "message"` → `content[]` with `type: "output_text"` → `.text`. Do not assume index 0 of `output`; a `web_search_call` item (and reasoning items) come first. SDKs expose `response.output_text`.
- Citations: `output[].content[].annotations[]` with `type: "url_citation"`, fields `url`, `title`, `start_index`, `end_index`. Your assumed path is right.
- Full list of consulted URLs (more than the cited ones): request `include: ["web_search_call.action.sources"]` and read `web_search_call.action.sources`.
- `usage`: `input_tokens`, `input_tokens_details.{cached_tokens, cache_write_tokens}`, `output_tokens`, `output_tokens_details.reasoning_tokens`, `total_tokens`. There is no cost field.
- Billable search count: top-level **`tool_usage.web_search.num_requests`** — "The number of billable web search requests issued." It is a sibling of `usage`, not inside it. "`web_search.num_requests` counts billable searches. Discounted searches and actions such as opening a page are excluded." The field is optional ("can be omitted when tool usage is unavailable"), so fall back to counting `web_search_call` items with `action.type == "search"` ("Search actions incur a tool call cost").

### (d) Prices — CONFIRMED

| Item | Price |
|---|---|
| Web search tool | "$10.00 / 1k calls + Search content tokens billed at model rates." ($0.01 per call) |
| `gpt-6-luna` (short context, ≤272K input) | $0.10 input / $0.50 output / $0.01 cached input per 1M |
| `gpt-5-mini` (deprecated) | $0.25 / $2.00 / $0.025 per 1M |
| `gpt-5-nano` (deprecated) | $0.05 / $0.40 / $0.005 per 1M |
| `gpt-5.6-luna` | $0.20 / $1.20 per 1M |

Batch and Flex are half price. The search fee dominates: one search call costs as much as 100K input tokens on `gpt-6-luna`.

---

## 2. Perplexity Agent API

Sources:
- https://docs.perplexity.ai/docs/agent-api/quickstart.md
- https://docs.perplexity.ai/docs/agent-api/tools/web-search.md
- https://docs.perplexity.ai/docs/agent-api/models.md
- https://docs.perplexity.ai/docs/getting-started/pricing.md
- https://docs.perplexity.ai/docs/agent-api/openai-compatibility.md
- https://docs.perplexity.ai/api-reference/agent-post.md
- https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/how-to.md
- https://docs.perplexity.ai/docs/admin/api-key-management.md

### (a) Endpoint — CONFIRMED: `POST https://api.perplexity.ai/v1/agent`

> "Perplexity's canonical Agent API endpoint is `POST /v1/agent`. For OpenAI SDK compatibility, `POST /v1/responses` is also accepted as an alias"

Auth: `Authorization: Bearer $PERPLEXITY_API_KEY`.

### (b) Request body — tool shape CONFIRMED; the `perplexity/sonar` + tool pairing is UNCONFIRMED

Doc example (verbatim):

```bash
curl https://api.perplexity.ai/v1/agent \
  -H "Authorization: Bearer $PERPLEXITY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-5.6-luna",
    "input": "What is the latest stable Rust release, and what changed?",
    "tools": [
      { "type": "web_search", "search_type": "fast" }
    ]
  }'
```

`web_search` tool parameters (from the doc's Parameters table):

| Parameter | Notes |
|---|---|
| `type` | Must be `"web_search"` |
| `search_type` | `"web"` or `"fast"`. Defaults to `"web"` unless an effort level sets it |
| `filters` | `search_domain_filter` (≤20, prefix `-` to exclude), `search_recency_filter` (`hour`/`day`/`week`/`month`/`year`), `search_after_date_filter`, `search_before_date_filter`, `last_updated_after_filter`, `last_updated_before_filter` (MM/DD/YYYY) |
| `user_location` | `country`, `region`, `city`, `latitude`, `longitude` |
| `max_results` | 1–50 |
| `max_tokens`, `max_tokens_per_page` | search context budgets |

`user_location` placement: "`user_location` sits alongside `filters`, while the other controls sit inside `filters`." Example from the doc: `user_location: { country: "US", region: "CA", city: "San Francisco", latitude: 37.7749, longitude: -122.4194 }`.

> "`latitude` and `longitude` must be provided together with `country`. They cannot be supplied on their own."

Your assumed names (`search_type: "fast"`, `user_location` with country/region/city/latitude/longitude) are all correct.

`perplexity/sonar`: the id exists in the Agent API models table ("Perplexity's grounded search model."). But:
- No fetched page shows `perplexity/sonar` used together with `tools: [{type: "web_search"}]`. **UNCONFIRMED** that this combination behaves as you expect.
- The migration guide says: "requests that select a model directly must add the tool to search the web", and suggests `sonar` → `effort: "fast"` rather than a direct model.
- API reference on `max_steps`: "For requests that specify model or models without an effort level, the default is 1." One step is enough for search-then-answer with `web_search`: Perplexity's own `fast` effort level is published as a frozen direct-model request with `"max_steps": 1` and the tool (below). (`finance_search` is the exception: "Set max_steps to at least 3 ... with a direct model".)
- `tool_choice` accepts `none` / `auto` / `required` or an object.

What Perplexity's `fast` effort level actually runs (https://docs.perplexity.ai/docs/agent-api/effort.md, "fast — current effort level values"). It does **not** use `perplexity/sonar`:

```json
{
  "models": ["openai/gpt-6-luna", "openai/gpt-5.6-luna"],
  "prompt_cache_key": "fast",
  "input": "...",
  "max_steps": 1,
  "reasoning": { "effort": "none" },
  "service_tier": "priority",
  "instructions": "## Role ...",
  "tools": [ { "type": "web_search", "search_type": "fast", "max_results": 10 } ]
}
```

This is the closest documented, known-working shape to what your spec wants. Two cost notes: `effort: "fast"` sets `service_tier: "priority"`, which bills tokens at 2× on models that support that tier; sending the explicit body without `service_tier` avoids that. `openai/gpt-6-luna` via Perplexity is priced on the Agent API Models page (not read for that row; check it against `perplexity/sonar` at $0.25 / $2.50).

Other request fields seen in the reference: `instructions`, `max_output_tokens`, `max_steps` (1–500), `effort`, `models` (fallback chain), `language_preference`, `service_tier`.

### (c) Response shape — CONFIRMED

```json
{
  "output": [
    {
      "type": "search_results",
      "queries": ["AI infrastructure announcements"],
      "results": [
        { "id": 1, "url": "https://example.com/news", "title": "...", "snippet": "...",
          "date": "2026-05-01", "last_updated": "2026-05-01", "source": "web" }
      ]
    },
    {
      "type": "message",
      "role": "assistant",
      "content": [ { "type": "output_text", "text": "The answer generated from the search results." } ]
    }
  ],
  "usage": {
    "input_tokens": 1200, "output_tokens": 300, "total_tokens": 1500,
    "tool_calls_details": { "search_web": { "invocation": 1 } }
  }
}
```

- Answer text: "take items with `"type": "message"`, then their `content` entries with `"type": "output_text"`. Agent API responses have no `choices[0].message.content`".
- Sources: the `output[]` item with `type: "search_results"` → `results[]` (`id`, `url`, `title`, `snippet`, `date`, `last_updated`, `source`). "treat the `id` and `url` fields of each `search_results` entry as the source of truth for citations."
- `content[].annotations[]` exists in the schema (`type` "url_citation", `url`, `title`, `start_index`, `end_index`) but is an empty array in every doc example. Inline `[1][2]` markers are prompt-dependent. Do not rely on annotations; use `search_results`.
- `usage.cost.total_cost` — CONFIRMED. Quickstart example: `"cost": {"currency": "USD", "input_cost": 0.00008, "output_cost": 0.00444, "total_cost": 0.00452}`; with tools it adds `tool_calls_cost` and `cache_read_cost`. Schema marks `currency`, `input_cost`, `output_cost`, `total_cost` required. Pricing page: "When present on a completed response, `usage.cost.total_cost` reports the calculated request cost." Treat it as possibly absent.

### (d) Key validation — UNCONFIRMED, docs and live behaviour disagree

- Docs: "The `GET /v1/models` endpoint returns all models available for the Agent API in OpenAI-compatible format. No authentication is required." (API reference also has `security: []`.)
- Live probe today: `GET https://api.perplexity.ai/v1/models` with no key and with a bogus key both returned HTTP 401 `{"error":{"message":"Invalid API key provided. Ensure your API key is correct and active.","type":"invalid_api_key","code":401}}`.
- So `GET /v1/models` with the user's key may be a free validation call, but I could not confirm a valid key returns 200 there. Try it with a real key before relying on it.
- The documented key test is a paid call: `POST /v1/agent` with `{"effort": "low", "input": "Test", "max_output_tokens": 1}` expecting 200. `effort: "low"` enables tools, so it is not minimal.
- Cheaper **derived** alternative: `POST /v1/agent` with `{"model": "perplexity/sonar", "input": "hi", "max_output_tokens": 1}` and no tools. At $0.25 / $2.50 per 1M that is a fraction of a cent, but not executed. A bogus key on this route returns 401 (live probe).

### (e) Prices — CONFIRMED

| Item | Price |
|---|---|
| `web_search` with `search_type: "fast"` | $0.001 per invocation ($1.00 per 1,000) |
| `web_search` standard (`"web"`) | $0.0025 per invocation ($2.50 per 1,000) |
| `perplexity/sonar` | $0.25 input / $2.50 output / $0.0625 cache read per 1M tokens |
| `fetch_url` | $0.0005 per invocation |

"Fast calls are still reported under `tool_calls_details.search_web`."

---

## 3. Gemini API — Grounding with Google Maps

Sources:
- https://ai.google.dev/gemini-api/docs/maps-grounding (now the Interactions API version)
- https://aistudio.google.com/docs/maps-grounding.md?generate-content=true (the `generateContent` version)
- https://aistudio.google.com/docs/google-search.md?generate-content=true
- https://ai.google.dev/gemini-api/docs/pricing , `/models` , `/deprecations`
- https://ai.google.dev/api/generate-content , `/api/caching` , `/api/models`
- https://aistudio.google.com/llms.txt

### Heads-up: `generateContent` is now labelled legacy

> "Use the Interactions API (`client.interactions`) as the default across all workflows. `generateContent` is still supported for existing integrations, but is considered a legacy API."

The default Maps grounding page now shows this instead:

```bash
curl -X POST "https://generativelanguage.googleapis.com/v1beta/interactions" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -H "Api-Revision: 2026-05-20" \
  -d '{
    "model": "gemini-4-hydrogen",
    "input": "What are the best Italian restaurants within a 15-minute walk from here?",
    "tools": [{ "type": "google_maps", "latitude": 34.050481, "longitude": -118.248526 }]
  }'
```

Your spec's `generateContent` shape still works per the docs (below). I did not read the Interactions response shape; if you switch, that needs its own check.

### (a) Model — `gemini-3.5-flash-lite` EXISTS and supports Maps grounding

Model page: "Model code `gemini-3.5-flash-lite`". Deprecations table: released July 21, 2026, "No shutdown date announced". It is in the Maps "Supported models" table.

Cheapest options that support Maps grounding:

| Model | Input / output per 1M | Status |
|---|---|---|
| `gemini-2.5-flash-lite` | $0.10 / $0.40 | Not deprecated, but "we are limiting access to the 2.5 models to users who have actively used them in the past ... For any new projects, use our latest models: 3.5 Flash-Lite or 3.8 Flash." |
| `gemini-3.1-flash-lite` | $0.25 / $1.50 | Shutdown date May 7, 2027; replacement `gemini-3.5-flash-lite` |
| `gemini-3.5-flash-lite` | $0.30 / $2.50 | Current, no shutdown date |

For a new project, `gemini-3.5-flash-lite` is the right pick; `gemini-3.1-flash-lite` is cheaper per token but shuts down in under six months.

### (b) REST request body — CONFIRMED exactly as assumed

```bash
curl -X POST 'https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent' \
  -H 'Content-Type: application/json' \
  -H "x-goog-api-key: ${GEMINI_API_KEY}" \
  -d '{
  "contents": [{
    "role": "user",
    "parts": [{ "text": "What are the best Italian restaurants within a 15-minute walk from here?" }]
  }],
  "tools": [{"googleMaps": {}}],
  "toolConfig": {
    "retrievalConfig": {
      "latLng": {"latitude": 34.050481, "longitude": -118.248526}
    }
  }
}'
```

Casing: `tools[].googleMaps`, `toolConfig.retrievalConfig.latLng.{latitude, longitude}`. `retrievalConfig` also accepts `languageCode` (BCP47).

### (c) Response path — CONFIRMED

```json
"groundingMetadata": {
  "groundingChunks": [
    { "maps": {
        "uri": "https://maps.google.com/?cid=13100894621228039586",
        "title": "Heaven on 7th Marketplace",
        "placeId": "places/ChIJ0-zA1vBZwokRon0fGj-6z7U" } }
  ],
  "groundingSupports": [
    { "segment": { "startIndex": 0, "endIndex": 79, "text": "..." }, "groundingChunkIndices": [0] }
  ],
  "webSearchQueries": ["restaurants near me"]
}
```

Path: `candidates[0].groundingMetadata.groundingChunks[].maps.{uri, title, placeId}` (reference also lists `text` and `placeAnswerSources.reviewSnippets[]`).

Two things useful for matching against DataForSEO:
- `placeId` is prefixed: "in `places/{place_id}` format". DataForSEO's `place_id` is the bare `ChIJ...`. Strip `places/` before comparing.
- `uri` carries the CID (`?cid=...`), which matches DataForSEO's `cid`.

### (d) Search grounding tool name in REST — `google_search`

REST example (verbatim): `"tools": [ { "google_search": {} } ]`. The JS SDK example uses `googleSearch: {}` and the API reference names the field `googleSearch`. "Older models use a `google_search_retrieval` tool. For all current models, use the `google_search` tool". Follow the REST example and use `google_search`.

### (e) Pricing — CONFIRMED

`gemini-3.5-flash-lite`, paid tier: $0.30 input (text/image/video/audio), $2.50 output (including thinking tokens), $0.03 context caching.

Grounding, Gemini 3 and newer:
- Maps: "5,000 requests per month (free, shared across all Gemini 3 and newer models), then $14 / 1,000 search queries."
- Search: "5,000 free search requests per month (shared across all Gemini 3 and newer models), then $14 per 1,000 requests (subject to a daily cap of 1,500 requests per day)."
- Billing unit is per query the model runs, not per request: "A single search prompt ... might result in the model executing multiple search queries ... Each of these queries counts as a billable use of the tool."
- **Free tier: "Not available"** for both Maps and Search grounding on `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite` (footnote: "Can be tested in Google AI Studio"). This comes from the model-specific pricing rows. The generic "Pricing for tools" table on the same page shows an unqualified free-tier "500 RPD" for Google Maps, which reads as the Gemini 2.5 allowance; I relied on the model-specific rows. Expect a free-tier key to fail for grounding on Gemini 3+ models, and test it.

Grounding, Gemini 2.5: Maps "1,500 RPD (free), then $25 / 1,000 grounded prompts" (free tier 500 RPD); Search $35 / 1,000 grounded prompts.

Language limitation, docs disagree: the Interactions page says "Grounding with Google Maps currently only supports English language prompts and responses." The `generateContent` page does not list that limitation. Treat non-English prompts as untested.

Attribution requirements apply: Google Maps sources "must immediately follow the generated content", link to the source `uri`, and the text "Google Maps" must not be modified or translated.

### (f) List models for key validation — endpoint CONFIRMED, header form verified by probe only

`GET /v1beta/models` — "Lists the Models available through the Gemini API." The doc example authenticates with a query param: `curl https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY`. The `x-goog-api-key` header is what the `generateContent` examples use.

Live probe: `GET /v1beta/models?pageSize=1` with `x-goog-api-key: <invalid>` returned **HTTP 400** (not 401) with `"status": "INVALID_ARGUMENT"`, `"reason": "API_KEY_INVALID"`, "API key not valid. Please pass a valid API key." So the header is read on this endpoint, and your validator should treat 400 + `API_KEY_INVALID` as "bad key".

A valid key on this endpoint does not prove the key is on a paid tier, which grounding needs.

---

## 4. DataForSEO

Sources:
- https://docs.dataforseo.com/v3/serp/google/maps/task_post/
- https://docs.dataforseo.com/v3/serp/google/maps/live/advanced/
- https://docs.dataforseo.com/v3/serp/google/maps/task_get/advanced/
- https://docs.dataforseo.com/v3/serp/google/maps/tasks_ready/
- https://docs.dataforseo.com/v3/appendix/user_data/
- https://docs.dataforseo.com/v3/serp/google/locations/
- https://docs.dataforseo.com/v3/business_data/google/my_business_info/live/
- https://dataforseo.com/pricing/serp/google-maps-serp-api (redirects to https://dataforseo.com/pricing/google-serp/google-maps-serp-api)
- https://dataforseo.com/pricing/business-data/business-data-api
- https://docs.dataforseo.com/v3/ai_optimization/overview/ , `/v3/ai_optimization/chat_gpt/llm_responses/live/`
- https://dataforseo.com/pricing/ai-optimization/llm-responses

### (a) Maps `task_post` fields — all CONFIRMED

`POST https://api.dataforseo.com/v3/serp/google/maps/task_post`. Up to 100 tasks per POST.

| Field | Confirmed detail |
|---|---|
| `keyword` | required, up to 700 chars |
| `location_coordinate` | "should be specified in the "latitude,longitude,zoom" format"; "if "zoom" is not specified, 17z will be applied as a default value"; max 7 decimal digits; zoom 3z–21z; example `52.6178549,-155.352142,20z`. Your `"30.2672,-97.7431,15z"` is valid. |
| `language_code` | "required field if you don't specify language_name"; example `en` |
| `depth` | default 100, max 700; billed per 100 results |
| `priority` | "1 – normal execution priority (set by default)", "2 – high execution priority" |
| `tag` | up to 255 chars, returned in the response `data` object |
| `pingback_url` | GET notification; "you can use the '$id' string as a $id variable and '$tag' as urlencoded $tag variable"; example `http://your-server.com/pingscript?id=$id&tag=$tag` |
| `search_places` | boolean, default true; "to prevent this interference and obtain correct results for keywords with local intent you may set this parameter to false". "if the search_places mode is turned off and no results were found in the search area, the results array will be empty" |

Also available: `location_code`, `location_name`, `postback_url` + `postback_data: "advanced"`, `device`, `os`, `search_this_area` (default true), `se_domain`, `max_crawl_pages`. Pingback note: "if your server doesn't respond within 10 seconds, the connection will be aborted by timeout".

### (b) Live endpoint — CONFIRMED

`POST https://api.dataforseo.com/v3/serp/google/maps/live/advanced` — "Your account will be charged for each request." One task per Live call.

### (c) Retrieval endpoints and result fields — CONFIRMED

- `GET https://api.dataforseo.com/v3/serp/google/maps/task_get/advanced/$id`
- `GET https://api.dataforseo.com/v3/serp/google/maps/tasks_ready`

`maps_search` item fields: `type`, `rank_group`, `rank_absolute`, `domain`, `title`, `original_title`, `url`, `contact_url`, `contributor_url`, `book_online_url`, `rating` { `rating_type`, `value`, `votes_count`, `rating_max` }, `rating_distribution`, `snippet`, `address`, `address_info` { `borough`, `address`, `city`, `zip`, `region`, `country_code` }, `place_id`, `phone`, `main_image`, `total_photos`, `category`, `additional_categories`, `category_ids`, `work_hours` { `timetable`, `current_status` }, `feature_id`, `cid`, `latitude`, `longitude`, `is_claimed`, `local_justifications`, `is_directory_item`, `price_level`, `hotel_rating`.

Every field in your list is present. Sample values: `"place_id": "ChIJSe0feYkFsocRajueupcvpas"`, `"cid": "12368344280360434538"` (a string), `"domain": null` and `"url": null` and `"phone": null` do occur. There is also a `maps_paid_item` type with its own rank fields; filter on `type`.

Cost: `cost` (float, USD) exists at the top level ("total tasks cost, USD") and on each `tasks[]` entry. In the `task_get` sample it is `0`, consistent with "you only pay when the task is set". Read the charge from the `task_post` response (or the Live response), not from `task_get`.

### (d) Balance — CONFIRMED: `tasks[0].result[0].money.balance`

`GET https://api.dataforseo.com/v3/appendix/user_data` — "Your account will not be charged for using this API". Verified from the raw sample that `money` is a sibling of `login`, `timezone`, `rates` directly under `result[0]`:

```json
"result": [ { "login": "...", "timezone": "...", "rates": {...},
  "money": { "total": 1, "balance": -3809.628325, "limits": {...} } } ]
```

`money.total` is "total amount of money deposited", `money.balance` is "amount of money left in your account". Free, so it doubles as credential validation.

### (e) Locations — CONFIRMED

`GET https://api.dataforseo.com/v3/serp/google/locations` and `/v3/serp/google/locations/$country` (e.g. `us`). Free. `location_name` format is comma-separated with no spaces: `"London,England,United Kingdom"`, `"Alaska,United States"`, `"United States"`. Items carry `location_code`, `location_name`, `country_iso_code`, `location_type`.

### (f) My Business Info live — CONFIRMED

`POST https://api.dataforseo.com/v3/business_data/google/my_business_info/live` (one task per call).

Request: `keyword` (required) which "can also be used to pass" `cid:194604053573767737` or `place_id:GhIJQWDl0CIeQUARxks3icF8U8A`; plus `location_name` / `location_code` / `location_coordinate`, `language_name` / `language_code`, `tag`. Location lists for this API come from `/v3/business_data/google/locations`.

Response item fields: `title`, `original_title`, `description`, `category`, `category_ids`, `additional_categories`, `cid`, `feature_id`, `address`, `address_info`, `place_id`, `phone`, `url`, `contact_url`, `contributor_url`, `book_online_url`, `domain`, `logo`, `main_image`, `total_photos`, `snippet`, `latitude`, `longitude`, `is_claimed`, `attributes` { `available_attributes`, `unavailable_attributes` }, `place_topics`, `rating` { `rating_type`, `value`, `votes_count`, `rating_max` }, `rating_distribution`, `people_also_search`, `work_time`.

Naming difference to handle: here hours are nested as **`work_time.work_hours`**, whereas the Maps SERP item has a top-level **`work_hours`**.

Price per business profile: Standard $0.0015, Priority $0.003, **Live $0.0054** ($5.40 per 1,000).

### (g) Maps SERP prices — CONFIRMED

| Mode | Price per SERP (up to 100 results) | Turnaround |
|---|---|---|
| Standard queue | $0.0006 ($0.60 per 1K) | ~5 minutes average, target 45 minutes |
| Priority queue | $0.0012 ($1.20 per 1K) | up to 1 minute average |
| Live | $0.002 ($2.00 per 1K) | up to 6 seconds average |

Multipliers: `depth` adds one base price per extra 100 results (rounded up); `calculate_rectangles` ×2; ×5 "if the keyword contains a search operator". "Retrieving the results of a queued task is also free; you only pay when the task is set."

### (h) Bonus — AI Optimization "LLM Responses"

Exists: "LLM Responses API enables real-time generation of structured responses from leading LLMs, including ChatGPT, Claude, Gemini, and Perplexity". Paths follow `/v3/ai_optimization/{chat_gpt|claude|gemini|perplexity}/llm_responses/{live|task_post|task_get|tasks_ready|models}`.

Web search and location (read on the ChatGPT live page only; the other three platforms are UNCONFIRMED): `web_search` (boolean, default false), `force_web_search`, `web_search_country_iso_code`, `web_search_city`. Result includes `annotations` with `title` / `url` and `money_spent`.

Price: Live "$0.0006 + price charged by LLM"; Standard "$0.0002 + $0.01 advance payment" (refunded down to actual), turnaround "Up to 72 hours". So it is a thin markup over the underlying LLM cost, not a flat per-call price.

---

## 5. MCP TypeScript SDK

Sources:
- https://github.com/modelcontextprotocol/typescript-sdk (README on `main`)
- `docs/serving/http.md`, `docs/serving/web-standard.md`, `docs/serving/authorization.md` in that repo
- `src/server/webStandardStreamableHttp.ts` on the `v1.x` branch
- https://github.com/vercel/mcp-handler (README, `docs/AUTHORIZATION.md`, `docs/CLIENTS.md`)
- npm registry for `@modelcontextprotocol/sdk`, `@modelcontextprotocol/server`, `mcp-handler`, `mcp-remote`, `zod`
- https://code.claude.com/docs/en/mcp.md
- https://cursor.com/docs/mcp.md
- https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- https://github.com/geelen/mcp-remote (README)

### Versions — CONTRADICTS the spec's package choice

| Package | Latest (npm `latest`) | Status |
|---|---|---|
| `@modelcontextprotocol/sdk` | 1.32.2 (2026-10-23) | **Legacy v1 line** |
| `@modelcontextprotocol/server` | 2.4.0 (2026-10-23) | Current v2 server package |
| `mcp-handler` | 2.4.0 (2026-11-12) | Vercel adapter, built on SDK v2 |
| `mcp-remote` | 0.16.6 (2026-11-11) | stdio-to-HTTP bridge |
| `zod` | 4.6.7 | SDK v2 uses Standard Schema; "bring Zod v4" |

README: "This is the `main` branch: v2 of the SDK (`@modelcontextprotocol/server`, `@modelcontextprotocol/client`), the stable release line, implementing the 2026-07-28 MCP spec" and "v1.x (`@modelcontextprotocol/sdk`) ... continues to receive bug fixes and security updates for at least six months after the v2 release (2026-07-27)." That puts v1 support at risk from roughly late January 2027.

### Recommended stateless Streamable HTTP on Web Request/Response

- `WebStandardStreamableHTTPServerTransport` **does exist, but only in v1** (`@modelcontextprotocol/sdk`, class defined in `src/server/webStandardStreamableHttp.ts`, stateless via `sessionIdGenerator: undefined`).
- In v2 it is replaced: "`createMcpHandler` replaces the per-request `StreamableHTTPServerTransport` + `connect()` wiring".
- v2 `createMcpHandler(factory)` "returns `{ fetch, close, notify, bus }`; `fetch` is a web-standard `(Request) => Promise<Response>`." It is stateless by default: "The factory runs once per HTTP request ... the handler holds nothing between requests."
- `mcp-handler` is not required. It is the only source that documents a Next.js route mount, and it adds `withMcpAuth`. Naming trap: `mcp-handler` 2.x also exports a function called `createMcpHandler`, with a **different signature** (callback receives a `server` to register on, and the result is itself the route handler).

Security note from the SDK docs that applies to both: "The handler trusts its caller: it validates no `Host` header, no `Origin` header, and no token."

### Sketch A — bare SDK v2 in a Next.js route handler (**derived**, not executed)

The SDK docs show this pattern for Workers/Deno/Bun (`export default { fetch }`); the Next.js `export async function POST` wrapper is my adaptation of it. Imports, `registerTool` signature, and the `handler.fetch(request, { authInfo })` pass-through are verbatim from the docs.

```ts
// app/api/mcp/route.ts
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import type { AuthInfo } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const handler = createMcpHandler(({ authInfo }) => {
  const server = new McpServer({ name: 'my-app', version: '1.0.0' });
  server.registerTool(
    'get_rank',
    {
      description: 'Get the rank for a keyword',
      inputSchema: z.object({ keyword: z.string() }),
    },
    async ({ keyword }, ctx) => {
      const caller = ctx.http?.authInfo; // same object passed to fetch below
      return { content: [{ type: 'text', text: `${keyword} for ${caller?.clientId}` }] };
    },
  );
  return server;
});

async function verify(request: Request): Promise<AuthInfo | undefined> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return undefined;
  const user = await lookUpApiKey(token); // your own lookup
  if (!user) return undefined;
  return { token, clientId: user.id, scopes: [] };
}

async function route(request: Request): Promise<Response> {
  const authInfo = await verify(request);
  if (!authInfo) return new Response('Unauthorized', { status: 401 });
  return handler.fetch(request, { authInfo });
}

export { route as GET, route as POST, route as DELETE };
```

Documented facts behind it: "verify the token yourself and pass the result as `fetch`'s second argument, and handlers read it as `ctx.http.authInfo`"; the factory "receives the request context — `era`, `authInfo`, and the inbound `Request` as `requestInfo`". `AuthInfo` fields seen in doc examples: `token`, `clientId`, `scopes`, `expiresAt`, `resource`, `extra`. The SDK also ships `requireBearerAuth` from `@modelcontextprotocol/server` for web-standard hosts, which returns either an `AuthInfo` or a ready 401/403 `Response` with OAuth `WWW-Authenticate` challenges; that is aimed at OAuth resource servers rather than static API keys.

### Sketch B — `mcp-handler` 2.x (abridged from its README and AUTHORIZATION.md, not executed)

The documented `withMcpAuth` call also passes `requiredScopes: ["read:stuff"]` and `resourceMetadataPath: "/.well-known/oauth-protected-resource"`; I left those out because they are for OAuth, not static API keys.

```bash
npm install mcp-handler@^2 @modelcontextprotocol/server@^2 zod@^4
```

```ts
// app/api/mcp/route.ts
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";

const handler = createMcpHandler((server) => {
  server.registerTool(
    "echo",
    { title: "Echo", description: "Echo a message", inputSchema: z.object({ message: z.string() }) },
    async ({ message }, ctx) => {
      const authInfo = ctx.http?.authInfo;
      return { content: [{ type: "text", text: `Echo: ${message} for ${authInfo?.clientId}` }] };
    },
  );
}, {});

const verifyToken = async (req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined;
  // your verification here
  return { token: bearerToken, scopes: ["read:stuff"], clientId: "user123", extra: { userId: "123" } };
};

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

export { authHandler as GET, authHandler as POST };
```

Notes from its docs: requires Node 20+, zod ^4.2.0; "`inputSchema`/`argsSchema` take a full Standard Schema (e.g. `z.object({ ... })`) instead of a raw zod shape"; `server.tool(...)` is removed, use `registerTool`; `basePath`, `redisUrl`, `disableSse` etc. are removed; HTTP+SSE transport is removed; "GET/DELETE session operations answer `405` (serving is stateless)". It serves both the 2026-07-28 spec and 2025-era Streamable HTTP clients from one handler.

If you must stay on v1 (`@modelcontextprotocol/sdk` 1.32.2), use `mcp-handler` 1.x or `WebStandardStreamableHTTPServerTransport` with `sessionIdGenerator: undefined` and `transport.handleRequest(request)`. I did not write a v1 sketch.

### Client config formats

**Claude Code — CONFIRMED**

```bash
claude mcp add --transport http secure-api https://api.example.com/mcp \
  --header "Authorization: Bearer your-token"
```

"The `--transport` and `--header` flags also accept `-t` and `-H` short forms". JSON form (`.mcp.json` / `claude mcp add-json`):

```json
{ "mcpServers": { "api-server": {
  "type": "http",
  "url": "https://api.example.com/mcp",
  "headers": { "Authorization": "Bearer ${API_KEY}" } } } }
```

`"type": "http"` is mandatory here: "A JSON entry that has a `url` but no `type` is a configuration error, because Claude Code reads an entry with no `type` as a stdio server." This differs from Cursor.

**Cursor — CONFIRMED** (`.cursor/mcp.json` in the project, or `~/.cursor/mcp.json` globally)

```json
{ "mcpServers": { "remote-server": {
  "url": "https://api.example.com/mcp",
  "headers": { "Authorization": "Bearer ${env:MY_SERVICE_TOKEN}" } } } }
```

No `type` field in Cursor's examples.

**Claude Desktop — both routes exist**

- Native: Settings → Connectors → "Add custom connector", enter the remote MCP URL. The support article now documents fixed credentials: "Under Request headers, add fixed credentials such as API keys that Claude sends on every request if your MCP server authenticates with an API key, bearer token, or other fixed credential instead of OAuth." Available on "Free, Pro, Max, Ultra, Team, and Enterprise plans. Free users are limited to one custom connector". I read the article, not the UI, so the exact field layout is UNCONFIRMED.
- `mcp-remote` in `claude_desktop_config.json` still works and is what `mcp-handler`'s docs show:

```json
{ "mcpServers": { "remote-example": {
  "command": "npx",
  "args": ["mcp-remote", "https://remote.mcp.server/mcp", "--header", "Authorization:${AUTH_HEADER}"],
  "env": { "AUTH_HEADER": "Bearer <auth-token>" } } } }
```

The no-space form is deliberate: "Cursor, Codex-Cli and Claude Desktop (Windows) have a bug where spaces inside `args` aren't escaped". `--header-file` is also available to keep the token out of the process list.

---

## 6. Stripe

Sources:
- https://docs.stripe.com/tax/tax-codes.md
- https://docs.stripe.com/api/checkout/sessions/create.md (plus `?query=line_items`, `tax_id_collection`, `invoice_creation`, `automatic_tax`)
- https://docs.stripe.com/tax/checkout/tax-ids.md
- https://docs.stripe.com/api/versioning.md
- npm registry for `stripe`; stripe-node wiki "Migration guide for v23"; `stripe@23.1.0/cjs/apiVersion.js`

### (a) Tax code — CONFIRMED

| Code | Name |
|---|---|
| `txcd_10103001` | "Software as a service (SaaS) - business use" |
| `txcd_10103000` | "Software as a service (SaaS) - personal use" |

Both carry: "Note: The distinction between business use and personal use for this product tax category is relevant only if you have sales in the US." So outside the US the choice does not change the result; pick `txcd_10103001` if buyers are businesses. (`txcd_10103100` / `txcd_10103101` are the "electronic download" variants; not what you want for a web app.)

### (b) Checkout Session in `mode: "payment"`

Each parameter is confirmed individually from the reference. I did not create a session, so "valid together" is **not executed**; I found nothing in the docs that makes them conflict.

| Parameter | Confirmed |
|---|---|
| `expires_at` | "It can be anywhere from 30 minutes to 24 hours after Checkout Session creation. By default, this value is 24 hours from creation." |
| `customer_creation: "always"` | "Can only be set in `payment` and `setup` mode." |
| `invoice_creation.enabled` | boolean, required within the object; "Generate a post-purchase Invoice for one-time payments." |
| `tax_id_collection.enabled` | boolean; optional `required: "never" \| "if_supported"` |
| `automatic_tax.enabled` | boolean; "Enabling this parameter causes Checkout to collect any billing address information necessary for tax calculation." |
| `billing_address_collection: "required"` | "Checkout will always collect the customer's billing address." |
| `line_items[].price_data.currency` | required |
| `line_items[].price_data.product` | "One of `product` or `product_data` is required." |
| `line_items[].price_data.unit_amount` | "required conditionally" (alternative: `unit_amount_decimal`) |
| `line_items[].price_data.tax_behavior` | `inclusive` / `exclusive` / `unspecified`; "Only required if a default tax behavior was not provided in the Stripe Tax settings." |

Related notes:
- `price_data` has no `tax_code` of its own; the only tax-code field in this request is `product_data.tax_code` ("recommended if calculating taxes"), which applies when creating the product inline. With `price_data.product` (an existing Product id) you would set `tax_code` on that Product instead. That last step is my reading of how Products work; I did not re-read the Products reference today.
- `customer_creation: "if_required"` already creates a Customer for "`payment` mode Sessions with post-purchase invoices enabled"; `"always"` is still fine and explicit.
- Tax IDs: with `customer_creation`, "Checkout saves any tax ID information collected during a session to that new Account or Customer." If you ever pass an existing `customer`, the tax-ID guide says to set `customer_update[name]=auto`.

### Versions — CONFIRMED

- Current API version: "The current version is **2026-10-28.endive**."
- `stripe` npm latest: **23.1.0** (2026-10-29), major **23**. v23.0.0 pinned `2026-09-30.endive`; `stripe@23.1.0` ships `exports.ApiVersion = '2026-10-28.endive'`.
- v23 requires Node 20+: "Node.js versions lower than `20` are no longer supported."

---

## 7. Next.js and Supabase SSR

Sources:
- npm registry for `next`, `@supabase/ssr`, `@supabase/supabase-js`
- https://nextjs.org/docs/llms.txt
- https://nextjs.org/docs/app/guides/upgrading/version-16.md
- https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents.md
- https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config.md
- https://nextjs.org/docs/app/guides/incremental-static-regeneration.md
- https://supabase.com/docs/guides/auth/server-side/nextjs (redirects to `/guides/auth/server-side/creating-a-client?framework=nextjs`)
- https://supabase.com/docs/guides/auth/auth-email-passwordless.md
- `examples/auth/nextjs` and `examples/auth/nextjs-full` in github.com/supabase/supabase

### Next.js — latest stable **16.4.6** (npm `latest`, published 2026-11-09)

Docs header: "@doc-version: 16.4.6". Canary is 16.5.0; 15.5.29 is the backport line.

Breaking conventions for a new App Router project:

1. **`middleware.ts` → `proxy.ts`.** "The `middleware` filename is deprecated, and has been renamed to `proxy`". "The named export `middleware` is also deprecated. Rename your function to `proxy`." And: "The `edge` runtime is **NOT** supported in `proxy`. The `proxy` runtime is `nodejs`, and it cannot be configured." Config flags renamed too (`skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`).
2. **Async request APIs only.** "Starting with **Next.js 16**, synchronous access is fully removed." Applies to `cookies()`, `headers()`, `draftMode()`, `params` (layout, page, route, default, image files) and `searchParams` (page). So `const { id } = await params` and `const cookieStore = await cookies()`.
3. **`cacheComponents`** is a stable top-level flag (moved from `experimental` in 16.0.0) and replaces `experimental.ppr`, `useCache`, `dynamicIO`. The doc now says to set it "together with `partialPrefetching`":

   ```ts
   const nextConfig: NextConfig = { cacheComponents: true, partialPrefetching: true }
   ```

   "Set `partialPrefetching` explicitly. Leaving it unset logs a warning". Also: "Cache Components requires the Node.js runtime and does not support the `runtime` route segment config. Remove any `runtime` export".
4. **`revalidate` / ISR depends on that flag.**
   - Without `cacheComponents`: `export const revalidate = 60` still works (the ISR guide: "This guide covers ISR without Cache Components").
   - With `cacheComponents`: "`dynamic`, `dynamicParams`, `revalidate`, and `fetchCache` removed when Cache Components is enabled." Caching is then declared with the `use cache` directive plus `cacheLife` and `cacheTag`; see the separate "ISR with Cache Components" guide (not read here, so no snippet).
   - Decide this up front; the two models are not mixed per route.
5. Turbopack is the default bundler; Node.js minimum 20.9.0; TypeScript minimum 5.1.0; `next lint` removed; AMP removed; parallel routes require `default.js`.
6. Caching API changes exist for `revalidateTag`, plus new `updateTag` and `refresh` (section headings confirmed; signatures not read).

### `@supabase/ssr` — latest **0.12.7** (2026-09-08); `@supabase/supabase-js` 2.119.0

Cookie handling is `getAll` / `setAll` — CONFIRMED. Current server client from Supabase's example (`lib/supabase/server.ts`):

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet, _headers) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have a proxy refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
```

Differences from older tutorials:
- Env var is `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (key format `sb_publishable_...`), not `..._ANON_KEY`.
- `setAll` now receives a second argument: "a `headers` object containing the cache headers `Cache-Control`, `Expires`, and `Pragma`, which must be applied to the HTTP response to prevent CDNs from caching the response and leaking the session to other users. In the Proxy, apply these headers to the response."
- The session refresher lives in `proxy.ts` exporting `proxy`. "On Next.js 15 and earlier, a `proxy.ts` file is never called".

Proxy `setAll` from the example (`lib/supabase/proxy.ts`):

```ts
setAll(cookiesToSet, headers) {
  cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
  supabaseResponse = NextResponse.next({ request })
  cookiesToSet.forEach(({ name, value, options }) =>
    supabaseResponse.cookies.set(name, value, options)
  )
  Object.entries(headers).forEach(([key, value]) =>
    supabaseResponse.headers.set(key, value)
  )
},
```

followed by `const { data } = await supabase.auth.getClaims()` and `const user = data?.claims`, and returning `supabaseResponse` unchanged.

`getClaims()` vs `getUser()` — CONFIRMED: use **`getClaims()`**.

> "Always use `supabase.auth.getClaims()` to protect pages and user data."
> "*Never* trust `supabase.auth.getSession()` inside server code such as Proxy."
> "use `getClaims` to verify identity (typically for protecting pages and data), `getUser` when you need an up-to-date user record from the Auth server, and `getSession` when you need the access or refresh token directly"

"`getClaims()` verifies the token's signature on every call. On projects with asymmetric signing keys, the default for new projects, it verifies locally ... On projects still using a symmetric secret, it calls the Auth server instead."

PKCE magic-link confirm route — CONFIRMED. Email template:

```html
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
```

Route (`app/auth/confirm/route.ts`, from the `nextjs-full` example):

```ts
import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      redirect(next)
    }
  }
  redirect('/error')
}
```

The example redirects to whatever `next` contains; validate it as a same-site relative path in your own version.

---

## 8. OpenFreeMap, MapLibre, Nominatim, Overpass

Sources:
- https://openfreemap.org/ and https://openfreemap.org/quick_start/ ; HTTP status of each style URL
- npm registry for `maplibre-gl`
- https://operations.osmfoundation.org/policies/nominatim/
- https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
- https://wiki.openstreetmap.org/wiki/Overpass_API

### OpenFreeMap style URLs — verified by request

| URL | Result |
|---|---|
| https://tiles.openfreemap.org/styles/liberty | 200 |
| https://tiles.openfreemap.org/styles/positron | 200 |
| https://tiles.openfreemap.org/styles/bright | 200 |
| https://tiles.openfreemap.org/styles/dark | 200 |
| https://tiles.openfreemap.org/styles/fiord | 200 |
| `/styles/3d`, `/styles/liberty-3d` | 404 — the site's style picker lists "3D", but its URL is UNCONFIRMED |

"Using our public instance is completely free: there are no limits on the number of map views or requests. There's no registration, no user database, no API keys, and no cookies." Commercial use: "Yes." No SLA.

Attribution — required:

> "Attribution is required. If you are using MapLibre, they are automatically added, you have nothing to do. If you are using alternative clients, or if you are using this in printed media or video, you must add the following attribution: OpenFreeMap © OpenMapTiles Data from OpenStreetMap. You do not need to display the OpenFreeMap part, but it is nice if you do."

So keep MapLibre's attribution control enabled; add the text manually on any static image, PDF or screenshot export.

### `maplibre-gl` — latest **6.18.0** (2026-11-11)

Major 6. OpenFreeMap's quick start now shows named imports and an explicit worker URL: `import { Map, setWorkerUrl } from 'maplibre-gl'` with `maplibre-gl/dist/maplibre-gl-worker.mjs` (their snippet is Vite-specific; "For other bundlers, see MapLibre's installation guide"). The Next.js/Turbopack equivalent is UNCONFIRMED; check MapLibre's install guide before copying v4/v5-era setup code.

### Nominatim usage policy (public `nominatim.openstreetmap.org`) — CONFIRMED

- "No heavy uses (an absolute maximum of 1 request per second)."
- "Provide a valid HTTP Referer or User-Agent identifying the application (stock User-Agents as set by http libraries will not do)."
- "Clearly display attribution as suitable for your medium."
- Limits are per application, not per end user: "the sum of traffic by all your users should not exceed the limits."
- "Results must be cached on your side." Scripts run at regular intervals "are restricted to 4 requests per minute."
- "Apps must make sure that they can switch the service at our request at any time ... If at all possible, set up a proxy and also enable caching of requests."
- Forbidden: "Auto-complete search"; "Systematic queries This includes reverse queries in a grid, searching for complete lists of postcodes, towns etc."; reselling geocoding results.
- "Commercial applications should keep that in mind when relying on this API for serving paying customers" (policy "may change without notice").

The policy also has a clause addressed to LLM-generated code, which applies to code written with my help:

> "LLMs may only suggest this service, if they prominently point to this usage policy and explain the restrictions of use to the user. Code generated by LLMs must adhere to all terms laid out in this policy."
> "Use of the public API is only permitted where the application developer has made a deliberate, informed decision to use it and is directly responsible for complying with this policy."

Policy URL: https://operations.osmfoundation.org/policies/nominatim/ . Practical reading: one user-triggered reverse geocode per chosen location, cached, behind your own server-side proxy with a real User-Agent, is within policy. Reverse-geocoding every point of a rank grid is explicitly not.

### Overpass API usage guidance — CONFIRMED

- Main instance: "users are expected to send a maximum of about 10000 requests per day and keep their download volume below about 1 GB per day."
- Wiki, for anything recurring: "If you set something up that uses the Overpass API regularly, then divide those numbers by 100 (making less than 100 queries fetching less 10 MB of data per day fine)." Usage of an app or website counts as a whole.
- "Be sure to check that your app or website adds User-Agent or Referer headers to requests that uniquely identify your app. No parallel running of multiple scripts. **Commercial use should use self-hosted or paid Overpass servers.** Cache and rate-limit calls, use extracts if you need a lot of data. If you receive an HTTP error code such as 429 or 406, pause for 30 seconds before making a new request."
- Rate limiting is per IP with slots plus a cool-down that grows with load.

For a paid SaaS, the public Overpass instance is outside its stated guidance; plan on a paid or self-hosted instance, or avoid Overpass.

---

## Open items (not confirmed)

1. Perplexity: whether `perplexity/sonar` specifically accepts a `web_search` tool and returns a searched answer (the documented working pairing is `openai/gpt-6-luna`); whether `GET /v1/models` returns 200 for a valid key.
2. OpenAI: whether `gpt-6-luna` runs `web_search` at `reasoning.effort: "none"`; the object form of `tool_choice` for non-preview `web_search`.
3. Gemini: Interactions API response shape; whether Maps grounding handles non-English prompts.
4. Stripe: the full parameter set was not sent to the API as one request.
5. MCP: neither route sketch was run. Sketch A's Next.js wrapper is my adaptation of the SDK's web-standard example.
6. DataForSEO LLM Responses: location parameters for Claude, Gemini and Perplexity endpoints.
7. OpenFreeMap 3D style URL; MapLibre 6 worker setup under Next.js.
8. Claude Desktop "Request headers" UI was read from the support article, not seen.

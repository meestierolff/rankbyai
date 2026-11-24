# SEO Agency AI Index — findings

Draft snapshot, computed 24 November 2026 (Europe/Amsterdam) from ChatGPT answers collected on **23 November 2026**. Nothing on this document is a ranking. Every number below is reproducible from `data/index-2026-11.csv` by running:

```bash
python3 /workspace/ship-or-die/ai-index/analyze.py
```

The CSV was built from the existing DataForSEO ChatGPT LLM Scraper results in `outreach/personalisation/` by `parse_index.py`. No new paid scans were run.

## Methodology

- **Query:** `best SEO agency in {city}` for each city. All 387 rows use that wording.
- **Engine / model:** ChatGPT, model `gpt-6`, via DataForSEO ChatGPT LLM Scraper Live (`POST /v3/ai_optimization/chat_gpt/llm_scraper/live/advanced`). Cost at collection was $0.004 per city.
- **When:** every answer has `date_collected_utc = 2026-11-23`. Collection timestamps run from 10:21 to 11:55 UTC (11:21–12:55 CET, Europe/Amsterdam) on 23 November 2026.
- **Where:** 387 cities in the United States (273), the United Kingdom (53), Australia (54) and New Zealand (7). Cities came from the outreach lead list, not from a census of every city in those countries.
- **One run per city, on one date.** ChatGPT answers vary from run to run. This is a snapshot of those 387 responses, not a ranking, not an average, and not a claim about what ChatGPT will say tomorrow.
- **What we counted as “named”:** the ordered shortlist in the answer (a numbered list in 335 of the 336 parsed cities; a bullet shortlist in one city, Alexandria, US, after a Virginia-vs-Egypt clarification). Opening sentences that preview two or three names were not used when a numbered list was present. Follow-up questions (“business type”, “monthly budget”) and map/local-pack cards were not treated as the shortlist.
- **Domains:** recorded only when the answer (or a name-matching link) actually gave a website. A blank domain means none was captured, not that the agency has no site. Directory and listicle URLs were not stored as the agency domain.
- **Cited sources:** taken from DataForSEO’s `sources` field where a raw file exists (325 cities). The three early answers (Denver, Cardiff, Sydney) have no raw file; they also had no explicit “Sources:” block, so their `n_sources` is 0.
- **Unparseable cities were left unmarked as shortlists**, not guessed. Reasons are in the CSV (`parse_status`, `parse_notes`) and summarised below.

### What this is not

- Not a claim that these agencies are “the best”, or that ChatGPT always names them.
- Not a multi-engine study (no Perplexity or Gemini in this dataset).
- Not proof that a directory citation caused a mention, only that the citation was present in that answer’s source list.

## 1. Coverage: 336 parsed, 51 unparseable

Of **387** cities, **336 (86.8%)** produced a parseable shortlist and **51 (13.2%)** were marked unparseable.

| Country | Cities | Parsed | Unparseable |
|---|---:|---:|---:|
| United States | 273 | 224 | 49 |
| United Kingdom | 53 | 52 | 1 |
| Australia | 54 | 54 | 0 |
| New Zealand | 7 | 6 | 1 |
| **Total** | **387** | **336** | **51** |

Almost all of the gaps are American: 49 of the 51 unparseable cities are in the US.

Unparseable reasons (from `parse_notes`):

| Reason | Cities | What happened |
|---|---:|---|
| `ambiguous_city_unresolved` | 15 | ChatGPT asked which place (or assumed one of several same-country cities, e.g. Carmel, Indiana vs Carmel-by-the-Sea). We did not guess. |
| `clarifying_question_no_agencies` | 15 | A clarifying question, and no usable shortlist (e.g. Hendersonville, TN vs NC). |
| `wrong_country` | 14 | The answer was clearly for another country than the one on the lead list. |
| `ambiguous_multiple_cities` | 7 | Two or more city-specific lists in one answer (e.g. Dover, Delaware and Dover, New Hampshire). |

The 14 `wrong_country` cities, because the mismatch is itself a finding:

- US list, UK/Ireland/Scotland answer: Aberdeen, Abingdon, Devon, Dublin, Kent, Northampton, Plymouth, Southampton
- US list, other countries: Melbourne (Australia), Vancouver (British Columbia), Vienna (Austria), Yukon (Canada)
- UK list, US answer: New York (answered as New York City)
- NZ list, UK answer: Cambridge

Those 14 were excluded from every agency-count and multi-city figure below. They remain in the CSV, with sources where DataForSEO returned them.

## 2. How many agencies were named?

In the **336** parsed answers ChatGPT named **1,610** agencies in total.

- **Mean: 4.79** names per answer (1,610 / 336)
- **Median: 5**
- **Range: 1 to 7**
- **Exactly five names: 213 of 336 answers (63.4%)**

Six answers named only one agency. Nineteen named seven.

By country (parsed answers only):

| Country | Parsed answers | Mean | Median | Min–max |
|---|---:|---:|---:|---|
| US | 224 | 4.91 | 5 | 1–7 |
| UK | 52 | 4.79 | 5 | 1–7 |
| AU | 54 | 4.30 | 5 | 1–5 |
| NZ | 6 | 4.83 | 5 | 4–5 |

Australian shortlists were slightly shorter: none of the 54 Australian answers named more than five agencies.

A domain was captured for **1,383 of 1,610** mentions (**85.9%**), in 328 of 336 parsed cities. The other names are still counted; they just have a blank domain.

## 3. Most names appear in one city; a minority show up in several

After normalising legal suffixes (Inc, LLC, Ltd, Pty and so on), there are **1,387 unique names**.

- **1,236 of 1,387 unique names (89.1%)** appear in **exactly one** city in this snapshot.
- **151 of 1,387 (10.9%)** appear in **two or more** cities.
- **48** names appear in three or more cities; **5** appear in five or more; **none** appear in ten or more.
- Those 151 multi-city names account for **374 of 1,610 mentions (23.2%)**.

The five names in five or more cities, with the cities they were named in:

| Name | Cities | Where |
|---|---:|---|
| Jives Media | 7 | US: Campbell, Los Gatos, New York, Oakland, Palo Alto, San Francisco, San Jose |
| SmartSites | 7 | US: Dallas, Doral, Hackensack, Lyndhurst, Miami, Newark, Scottsdale |
| MarketKeep | 6 | US: Baltimore, Glen Arm, Perry Hall, Pikesville, Towson, Windsor Mill |
| Digital Hitmen | 5 | AU: Attadale, Aveley, Belmont, Perth, Red Hill |
| Searchbloom | 5 | US: Bloomington, Park City, Salt Lake City, South Jordan, West Jordan |

Read this carefully. Many “multi-city” names are neighbouring suburbs of the same metro (Perth, Gold Coast, Melbourne, Baltimore, Utah’s Salt Lake valley, Newcastle NSW). That is a regional firm showing up in several nearby queries, not evidence of a national chain. Jives Media and SmartSites are the widest spreads in this snapshot (seven US cities each). Even they are not everywhere: they are absent from the large majority of the 224 parsed US cities.

**Same name in two countries is rare:** five normalised names appear in more than one country (Breakline in UK/US; Digital Next in AU/UK; SIXGUN in AU/NZ; StudioHawk in AU/US; WebFX in UK/US). A shared name is not proof it is the same firm. We did not verify offices or ownership. SIXGUN is the one case also tied to the same captured domain (`sixgun.com.au`) in Melbourne-area cities and Auckland.

**Position 1 is not dominated by a few brands.** There are 311 distinct names in first place. Only 21 of those are #1 in two or more cities. The most frequent first-place names appear in three cities each: Gorilla 360, Timmermann Group, and MarketKeep.

## 4. Citations cluster on a few directories — but not in every country

**325 of 387 answers (84.0%)** included at least one cited source in the DataForSEO `sources` list. Among parsed cities the share is **297 / 336 (88.4%)**. The mean number of cited sources per city (all 387) is **3.57** (median 3, range 0–12).

Share of all **387** answers whose cited sources include these directories (domain match, including subdomains):

| Directory | Cities | Share of 387 |
|---|---:|---:|
| Clutch | 146 | 37.7% |
| Expertise.com | 100 | 25.8% |
| The Manifest | 83 | 21.4% |
| Semrush Agency Directory | 43 | 11.1% |
| DesignRush | 23 | 5.9% |
| TopSEOs | 19 | 4.9% |
| GoodFirms | 9 | 2.3% |
| Sortlist | 4 | 1.0% |
| UpCity | 0 | 0.0% |
| **Any of the nine above** | **211** | **54.5%** |

UpCity does not appear in this snapshot at all.

The country split is large:

| Country | Any of those nine directories | Clutch | Expertise.com | The Manifest |
|---|---|---|---|---|
| US (273) | 182 / 273 (66.7%) | 125 / 273 (45.8%) | 99 / 273 (36.3%) | 72 / 273 (26.4%) |
| UK (53) | 21 / 53 (39.6%) | 16 / 53 (30.2%) | 1 / 53 (1.9%) | 10 / 53 (18.9%) |
| AU (54) | 4 / 54 (7.4%) | 3 / 54 (5.6%) | 0 / 54 (0.0%) | 0 / 54 (0.0%) |
| NZ (7) | 4 / 7 (57.1%) | 2 / 7 (28.6%) | 0 / 7 (0.0%) | 1 / 7 (14.3%) |

Australian answers rarely cite the global directories. They more often cite local lists: **28 of 54 Australian cities (51.9%)** cite at least one of starworks.com.au, localdigital.com.au, clearbrief.com.au, agencyecho.com.au, wordofmouth.com.au or pwd.com.au. starworks.com.au appears in 15 of 54 (27.8%); localdigital.com.au in 13 of 54 (24.1%); clearbrief.com.au in 12 of 54 (22.2%).

A citation means the directory (or list) was in that answer’s source list. It does not, on its own, prove why a particular agency was named.

## 5. How to reproduce

1. Inputs: the 387 `chatgpt-*.json` files in `/workspace/ship-or-die/outreach/personalisation/cities/` and, where present, the matching raw DataForSEO files in `outreach/personalisation/raw-dfs/` (384 files; Denver, Cardiff and Sydney have no raw file).
2. `python3 /workspace/ship-or-die/ai-index/parse_index.py` writes `data/index-2026-11.csv`.
3. `python3 /workspace/ship-or-die/ai-index/analyze.py` prints every statistic used in this document.

CSV columns: `city`, `country`, `query`, `date_collected_utc`, `datetime_collected_utc`, `datetime_collected_europe_amsterdam`, `model`, `task_id`, `source_file`, `raw_dfs_file`, `parse_status`, `parse_notes`, `n_agencies`, `agencies_json` (ordered `position` / `name` / `domain`), `n_sources`, `source_domains`, `sources_json`, `sources_origin`.

Unparseable rows keep the query, date, model and sources, and have an empty `agencies_json`.

## 6. Limits to keep on the public page

- One prompt, one model, one run, one day.
- Cities follow the outreach list (many US suburbs), so multi-city counts can be inflated by neighbouring places.
- Ambiguous US city names and wrong-country answers were excluded from the shortlist figures, which is conservative and also means those places are missing from the named-agency totals.
- Agency names are ChatGPT’s wording, lightly cleaned (labels such as “Best overall pick” removed). We did not verify that every name is a currently trading SEO firm.
- Same name or same domain in two cities was not manually reviewed for mergers, similarly named firms, or invented URLs in the underlying answer.

# SEO Agency AI Index — 23 November 2026

The original CSV, findings and parse QA are stored here. `index-2026-11.json`
is the public-facing projection: it excludes task IDs and internal file paths.
`aggregates-2026-11.json` is computed using the source analysis's name
normalisation and directory groups. There is no public CSV download.

Reproduce the import and findings without any network calls:

```sh
python3 scripts/import-ai-index.py data/ai-index/index-2026-11.csv
python3 scripts/analyze-ai-index.py
pnpm exec vitest run tests/unit/ai-index-data.test.tsx
```

The import retains recorded agency positions, including Fairfax's gap (2–5).
227 agency mentions have no domain: display the name without a website link.
62 city records have no cited sources, including Denver, Cardiff and Sydney,
whose raw collection files were not captured. Missing sources are not inferred.
Unparseable rows retain their sources, but never display an agency shortlist.

## Release switch

`AI_INDEX_PUBLIC` defaults to `false` (see `.env.example`). It is read on the
server at build time. Build again after an approved change to this flag.

| Behavior | false (preview default) | true (approved production release) |
| --- | --- | --- |
| Hub + all 387 cities | 200, noindex/follow | 200, index/follow |
| Sitemap | No index entries | Hub + 387 city URLs, real last-edit date |
| llms.txt | No index entry | Entity disclosure + snapshot/method link |
| Discovery links | Hidden | Homepage, pricing, AI visibility tracker, local SEO software, footer |
| Draft preview notices | Visible | Hidden |

The flag gates `indexPublished` in `src/lib/ai-index/data.ts`. Existing sitemap,
llms.txt and all five links consume that same value. The production environment was set to true for the owner-approved
24 November 2026 release. Existing `/ai/[niche]/[city]` templates and robots.txt are
unchanged. Unknown snapshot-city URLs return 404 through the proxy.

`publishedAt` is 2026-11-24, the actual publication date. The importer
preserves this value when regenerating the released snapshot. `updatedAt` is the real local
edit date, 2026-11-24, and supplies sitemap lastmod. Importing data does not
publish it. The approved release passed live checks and is recorded in `seo/page-log.md`.

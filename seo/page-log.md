# Public page release log

## 24 November 2026 — SEO Agency AI Index shipped

- Hub: https://rankbyai.live/ai-index/seo-agencies
- City pages: 387 under `/ai-index/seo-agencies/{country}/{city}`.
- Vercel deployment: `dpl_FtqAVKZjy8ZaRzFKTRKFw6ZMEvr5`.
- Production release explicitly approved by Mees in the implementation session.
- `AI_INDEX_PUBLIC=true` for the production environment. Preview default remains false.
- Actual publication date: 2026-11-24. Source collection date: 2026-11-23.
- Shipped status recorded after successful live HTTP checks of the canonical production domain.

Validation: production build passed; 49 focused tests passed. Hub and Denver,
Dublin and Springfield returned HTTP 200, index/follow and self canonicals.
The hub contains all 387 city links in raw HTML; the sitemap contains the hub
plus 387 city URLs. Dataset/FAQ/WebPage/Breadcrumb schema and publication date
verified. Parsed examples contain agency ItemList schema; unparseable examples
do not. llms.txt and the five discovery links are enabled. No CSV download.

Regression checks compared live responses against the pre-release baseline:
`/`, `/pricing`, `/ai/dentist/austin`, `/ai/dentist/manchester` and
`/ai/plumber/denver` retained status 200, title, canonical and robots metadata.
robots.txt remained byte-for-byte identical. Vercel reported no runtime errors
for the hub and no error/fatal log entries for the new deployment in the
selected 10-minute window immediately after release.

GSC/GA4/Bing baseline remains UNKNOWN. No new paid scans or research calls ran.

import { INDEX_PATH, indexPublished } from "@/lib/ai-index/data";
import Link from "next/link";
import { CookieChoicesButton } from "@/components/analytics/cookie-choices";
import { NOT_AFFILIATED } from "@/lib/copy";
import { legalEnv } from "@/lib/env";
import { hasRegionalPages } from "@/lib/regional";
import { SEO_PAGES } from "@/lib/seo-pages";
import { FooterMark } from "./footer-mark";
import { DotMark, LpWordmark } from "./lp";

const PRODUCT_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/docs/api", label: "API docs" },
  { href: "/ai", label: "AI by city" },
  { href: "/llms.txt", label: "llms.txt" },
];
const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refunds", label: "Refunds" },
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/removal", label: "Removal" },
  { href: "/support", label: "Support" },
];
/** Guide pages shown as the third column; every other guide goes in the row below. */
const GUIDE_COLUMN = ["/local-rank-tracker", "/ai-rank-tracker", "/map-rank-tracker", "/local-seo-software", "/blog/how-to-show-up-in-chatgpt"];
const SHORT_TITLE: Record<string, string> = {
  "/blog/how-to-show-up-in-chatgpt": "Show up in ChatGPT",
  "/local-rank-tracker": "Local Rank Tracker",
  "/ai-rank-tracker": "AI Rank Tracker",
  "/alternatives/local-viking": "Local Viking Alternative",
  "/alternatives/peec-ai": "Peec AI Alternative",
  "/alternatives/profound": "Profound Alternative",
  "/alternatives/otterly": "Otterly Alternatives",
  "/peec-ai-vs-profound": "Peec AI vs Profound",
  "/semrush-ai-visibility": "Semrush AI Visibility",
  "/blog/brightlocal-pricing": "BrightLocal Pricing",
  "/blog/peec-ai-pricing": "Peec AI Pricing",
  "/blog/profound-pricing": "Profound Pricing",
  "/blog/otterly-pricing": "Otterly Pricing",
};

const shortTitle = (path: string, title: string) =>
  SHORT_TITLE[path] ?? title.split(":")[0].replace(/ You Pay For Once| for Local Businesses| for Agencies, Paid Once| \(and Two Other Options\)/, "");

const linkClass = "text-lp-muted no-underline transition-colors hover:text-lp-fg";

/**
 * 9.16 Footer. The operator line comes from LEGAL_* env; nothing is invented when they are unset.
 * "AI by city" shows only once a regional page is public (a cached read, so it joins the static shell).
 */
export async function Footer({ padForStickyBar = false, hideAiIndexLink = false }: { padForStickyBar?: boolean; hideAiIndexLink?: boolean }) {
  const productLinks = (await hasRegionalPages()) ? PRODUCT_LINKS : PRODUCT_LINKS.filter((l) => l.href !== "/ai");
  const entity = legalEnv.entityName();
  const address = legalEnv.address();
  const email = legalEnv.email();
  const column = GUIDE_COLUMN.map((path) => SEO_PAGES.find((p) => p.path === path)).filter((p) => p !== undefined);
  const row = SEO_PAGES.filter((p) => !GUIDE_COLUMN.includes(p.path));
  return (
    <footer className="overflow-hidden border-t border-[#161616] bg-lp-bg pt-[72px] text-lp-fg">
      <div className="container-lp grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-10">
        <div>
          <Link href="/" className="flex items-center gap-[10px] text-lp-fg no-underline">
            <DotMark />
            <LpWordmark />
          </Link>
          <div className="mt-5 text-[13.5px] text-lp-dim">© 2026 RankbyAI</div>
          <div className="mt-[10px] max-w-[320px] text-[12.5px] leading-[1.6] text-lp-dim">
            {entity ? `Operated by ${entity}${address ? `, ${address}` : ""}. ` : ""}
            {NOT_AFFILIATED}
          </div>
          {/* Launch badges in each site's own markup (their links, their hosted images). */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a href="https://www.codehype.ai/product/rankbyai?utm_source=codehype_badge" target="_blank" rel="noopener noreferrer" className="inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://www.codehype.ai/badges/rankbyai.svg?variant=find-us&v=20"
                alt="Featured on CodeHype"
                width={180}
                height={65}
                loading="lazy"
                decoding="async"
                style={{ display: "inline-block", border: 0, width: "100%", maxWidth: 180, height: "auto", maxHeight: 65 }}
              />
            </a>
            <a href="https://nicklaunches.com/products/rankbyai/" target="_blank" rel="noopener" className="inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://nicklaunches.com/badges/featured.png"
                alt="RankbyAI on Nick Launches"
                width={244}
                height={56}
                loading="lazy"
                decoding="async"
                style={{ display: "block", maxWidth: "100%", height: "auto" }}
              />
            </a>
          </div>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-3 content-start gap-x-5 gap-y-3 text-[15px]">
          <div className="flex flex-col gap-3">
            {productLinks.map((l) => <Link key={l.href} href={l.href} className={linkClass}>{l.label}</Link>)}
            {email ? <a href={`mailto:${email}`} className={linkClass}>Contact</a> : null}
          </div>
          <div className="flex flex-col gap-3">
            {LEGAL_LINKS.map((l) => <Link key={l.href} href={l.href} className={linkClass}>{l.label}</Link>)}
            <CookieChoicesButton className={`${linkClass} text-[15px]`} />
          </div>
          <div className="flex flex-col gap-3">
            {column.map((p) => <Link key={p.path} href={p.path} className={linkClass}>{shortTitle(p.path, p.title)}</Link>)}
          </div>
        </nav>
      </div>
      <nav aria-label="Guides and comparisons" className="container-lp mt-10">
        <div className="flex flex-wrap gap-x-[18px] gap-y-2 border-t border-[#141414] pt-5 text-[12.5px] text-lp-dim">
          <span>Guides and comparisons:</span>
          {indexPublished && !hideAiIndexLink ? <Link href={INDEX_PATH} className={linkClass}>SEO Agency AI Index</Link> : null}
          {row.map((p) => <Link key={p.path} href={p.path} className="text-lp-dim no-underline transition-colors hover:text-lp-fg">{shortTitle(p.path, p.title)}</Link>)}
        </div>
      </nav>
      <div className={`flex items-center justify-center gap-[3vw] px-[3vw] pt-[9vw] ${padForStickyBar ? "pb-[calc(4vw+84px)]" : "pb-[4vw]"}`}>
        <FooterMark />
        <div aria-hidden className="font-display text-[12.4vw] leading-[0.9] font-extrabold tracking-[-0.035em] whitespace-nowrap text-[#f2f0ec]">RankbyAI</div>
      </div>
    </footer>
  );
}

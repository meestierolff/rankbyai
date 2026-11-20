import Link from "next/link";
import type { ReactNode } from "react";
import { RadarVisual } from "@/components/marketing/feature-row-radar";
import { RouterVisual } from "@/components/marketing/feature-row-router";
import { TerminalVisual } from "@/components/marketing/feature-row-terminal";
import { LpEyebrow, LpTextLink } from "@/components/marketing/lp";
import { estimateAiGrid, estimateMapsGrid } from "@/lib/cost/estimate";
import { AI_SAMPLE_EST_USD, ENGINES, PRICES_READ_ON } from "@/lib/pricing-constants";
import { cn } from "@/lib/utils";

/* Static (server-rendered) sections of the home page. Product facts live in HTML, not in client JS. */

const PROBLEMS = [
  "Monthly plans and credits that expire, whether you used them or not.",
  "AI scans billed as premium credits, so you check less often than you should.",
  "Tracker in one tool, audit in another, client reports in a third.",
  "You pay every month whether you won the client or not.",
];

/**
 * Problem, then the unit-cost band. Every figure is computed from lib/pricing-constants and labelled as an estimate.
 * `children` (the interactive dashboard tour) sits between the problem list and the cost band.
 */
export function Problem({ children }: { children?: ReactNode }) {
  const perPoint = AI_SAMPLE_EST_USD.openai + AI_SAMPLE_EST_USD.perplexity + AI_SAMPLE_EST_USD.geminiFree;
  const g3 = estimateAiGrid(3, ENGINES).rangeUsd;
  const maps = estimateMapsGrid(7, "standard").totalUsd;
  const stats = [
    { value: `~$${perPoint.toFixed(2)}`, label: "per AI check point", caption: "One prompt asked of 3 engines at one map point [estimate]" },
    {
      value: `~$${g3.low.toFixed(2)}–${g3.high.toFixed(2)}`,
      label: "per 3×3 AI grid",
      caption: "9 points, 3 engines. The range depends on Gemini's free allowance [estimate]",
    },
    { value: `~$${maps.toFixed(2)}`, label: "per 7×7 Maps grid", caption: "49 points on a scheduled scan" },
    { value: "$0", label: "markup from us", caption: "No monthly fee. No usage cap on your keys.", accent: true },
  ];
  return (
    <section id="problem" className="pt-[150px] pb-[60px] text-lp-fg">
      <div className="container-lp text-center">
        <LpEyebrow className="block">The problem</LpEyebrow>
        <h2 className="lp-h2 mx-0 mt-[18px] mb-0">You&apos;re renting your AI visibility tracker.</h2>
        <p className="lp-lead mx-auto mt-7 mb-0 max-w-[620px]">
          AI visibility tracking now lives inside monthly local SEO plans. They are good tools, but the meter never stops: a plan for the tracker,
          credits for the scans, another tool for the reports you use to win clients.
        </p>
      </div>
      <div className="container-lp mt-16">
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] gap-x-12 p-0">
          {PROBLEMS.map((p) => (
            <li key={p} className="flex gap-[14px] border-t border-lp-line-2 py-[22px] text-[16.5px] leading-normal text-lp-fg-2">
              <span aria-hidden className="font-mono text-lp-accent">✕</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
      {children ? <div className="mt-[100px]">{children}</div> : null}
      <div className="container-lp mt-[110px]">
        <h3 className="m-0 text-[clamp(30px,3.6vw,40px)] leading-[1.08] font-semibold tracking-[-0.04em]">
          The data costs cents.
          <br />
          <span className="text-[#6f6f6f]">You&apos;ve been paying for the meter.</span>
        </h3>
        <dl className="m-0 mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-x-7 border-b border-lp-line-2">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col border-t border-lp-line-2 py-6">
              <dt className="order-2 mt-[10px] text-[14.5px] leading-[1.3]">{s.label}</dt>
              <dd className={cn("font-display order-1 m-0 text-[26px] leading-[1.2] font-bold whitespace-nowrap", s.accent && "text-lp-accent-text")}>{s.value}</dd>
              <dd className="order-3 m-0 mt-[6px] text-[13px] leading-normal text-lp-dim">{s.caption}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-[18px] mb-0 text-[12.5px] leading-[1.6] text-lp-faint">
          Vendors set these rates and can change them. The app shows the estimate before every scan and the actual cost after. Prices read on the
          vendors&apos; pricing pages on {PRICES_READ_ON}.
        </p>
      </div>
    </section>
  );
}

/**
 * One feature row: copy and a framed visual side by side. The copy always comes first in the
 * document; `visualFirst` moves the visual to the left once the two columns fit next to each other
 * (two 340px columns and the 56px gap: a row at least 736px wide).
 */
function FeatureRow({ title, children, links, visual, visualFirst = false }: { title: string; children: ReactNode; links: ReactNode; visual: ReactNode; visualFirst?: boolean }) {
  return (
    <div className="@container grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-center gap-14">
      <div className="min-w-0">
        <h3 className="lp-h3 m-0">{title}</h3>
        <p className="lp-lead mx-0 mt-6 mb-0">{children}</p>
        <div className="mt-7 flex flex-wrap items-center gap-[22px]">{links}</div>
      </div>
      <div className={cn("min-w-0", visualFirst && "@min-[736px]:order-first")}>{visual}</div>
    </div>
  );
}

/** The three feature rows: AI grid, your own keys, API and MCP. `packsOpen` comes from lib/availability. */
export function FeatureRows({ packsOpen }: { packsOpen: boolean }) {
  return (
    <section id="features" className="pt-[140px] pb-[120px] text-lp-fg">
      <div className="container-lp flex flex-col gap-[170px]">
        <FeatureRow title="Three AI engines on one map" links={<LpTextLink href="#product">See the AI grid</LpTextLink>} visual={<RadarVisual />}>
          One prompt, asked of ChatGPT, Perplexity and Gemini at every point of a map grid, next to the Google Maps rank. Click any point to read
          the full answer, who was named in what order, and which sources were cited.
        </FeatureRow>
        <FeatureRow
          title="Bring your keys. Pay cost."
          visualFirst
          links={
            <>
              <LpTextLink href="#calc">Run your own numbers</LpTextLink>
              <Link href="#packs" className="text-[14px] text-lp-dim no-underline transition-colors hover:text-lp-fg">
                {packsOpen ? "No keys? Buy included scans" : "Included scans, no keys: coming soon"}
              </Link>
            </>
          }
          visual={<RouterVisual />}
        >
          RankbyAI is paid once. Every AI answer and Maps lookup runs on your own DataForSEO, OpenAI, Perplexity and Gemini keys at the
          vendor&apos;s price. We never sit between you and the bill, so we never cap your usage or charge you for it.
        </FeatureRow>
        <FeatureRow title="Hand it to your AI agent" links={<LpTextLink href="/docs/api">Read the API docs</LpTextLink>} visual={<TerminalVisual />}>
          Businesses, AI and Maps scans, audits, Fix Kits, prospect reports and branding are all in the REST API and the MCP server. Connect
          Claude, Cursor, ChatGPT or your own scripts and let the agent run them. Paid actions show the estimate first and need an explicit confirm.
        </FeatureRow>
      </div>
    </section>
  );
}

/** The three steps. Step one names the keys a buyer needs today; included scans only once they are on sale. */
const howSteps = (packsOpen: boolean) => [
  {
    title: "Add your keys.",
    body: `A DataForSEO login and at least one AI key (OpenAI, Perplexity or Gemini). Paste a key, we test it and show the balance where the vendor exposes one. Keys are encrypted before they are stored. ${packsOpen ? "No keys? Buy included scans and skip this step." : "Included scans that skip this step are coming soon."}`,
  },
  { title: "Add a business.", body: "Search it by name and confirm the Google listing." },
  { title: "Run a check.", body: "Pick a prompt and a grid, see the cost, hit run. The grid fills in point by point." },
];

/** These four statements are enforced in code and covered by tests. */
const SECURITY = [
  { title: "Encrypted at rest", body: "AES-256-GCM, before the key touches the database." },
  { title: "Write-only", body: "Replace or delete it any time. Nobody can read it back, including you." },
  { title: "Server-side only", body: "Keys are used only from our servers. They never reach a browser." },
  { title: "Cost before, cost after", body: "Estimate shown before every scan, actual cost logged after." },
];

/** How it works, then key security. */
export function HowItWorks({ packsOpen }: { packsOpen: boolean }) {
  const steps = howSteps(packsOpen);
  return (
    <section id="how" className="py-[130px] text-lp-fg">
      <div className="container-lp">
        <h2 className="m-0 max-w-[680px] text-[clamp(36px,4.8vw,56px)] leading-[1.02] font-semibold tracking-[-0.045em] text-balance">
          From signup to first AI grid in about five minutes.
        </h2>
        <ol className="m-0 mt-14 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-8 p-0">
          {steps.map((h, i) => (
            <li key={h.title} className="border-t border-[#2a2a2a] pt-[22px]">
              <div aria-hidden className="font-mono text-[13px] leading-[1.3] text-lp-accent-text">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="mt-[14px] mb-2 text-[19px] leading-[1.3] font-medium">{h.title}</div>
              <div className="text-[15px] leading-[1.6] text-lp-muted">{h.body}</div>
            </li>
          ))}
        </ol>
        <div className="mt-[130px] grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-12">
          <div>
            <h3 className="m-0 text-[clamp(32px,4vw,44px)] leading-[1.04] font-semibold tracking-[-0.045em]">Your keys stay yours.</h3>
            <p className="mx-0 mt-5 mb-0 max-w-[360px] text-[17px] leading-[1.6] text-lp-muted">
              Encrypted, write-only and used only from our servers. You see the cost before and after every scan.
            </p>
          </div>
          <ul className="m-0 flex list-none flex-col border-b border-lp-line-2 p-0">
            {SECURITY.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[44px_1fr] gap-3 border-t border-lp-line-2 py-[18px]">
                <span aria-hidden className="pt-[3px] font-mono text-[12px] leading-[1.3] text-lp-faint">
                  /{String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <div className="text-[16.5px] leading-[1.3]">{s.title}</div>
                  <div className="mt-1 text-[14.5px] leading-[1.55] text-lp-muted">{s.body}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

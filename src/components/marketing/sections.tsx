import Link from "next/link";
import { Band, Card, Eyebrow, SampleTag, Stat } from "@/components/brand/primitives";
import { estimateAiGrid, estimateMapsGrid } from "@/lib/cost/estimate";
import { AI_SAMPLE_EST_USD, ENGINES, PRICES_READ_ON } from "@/lib/pricing-constants";

/* Static (server-rendered) sections of the home page. Product facts live in HTML, not in client JS. */

/** 9.4 Unit-cost strip. Every figure is computed from lib/pricing-constants and labelled as an estimate. */
export function CostBand() {
  const perPoint = AI_SAMPLE_EST_USD.openai + AI_SAMPLE_EST_USD.perplexity + AI_SAMPLE_EST_USD.geminiFree;
  const g3 = estimateAiGrid(3, ENGINES).rangeUsd;
  const maps = estimateMapsGrid(7, "standard").totalUsd;
  return (
    <Band>
      <div className="container-page band-y flex flex-col gap-8">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-8">
          <Stat value={`~$${perPoint.toFixed(2)}`} label="per AI check point" caption="One prompt asked of 3 engines at one map point [estimate]" />
          <Stat value={`~$${g3.low.toFixed(2)}–${g3.high.toFixed(2)}`} label="per 3×3 AI grid" caption="9 points, 3 engines. The range depends on Gemini's free allowance [estimate]" />
          <Stat value={`~$${maps.toFixed(2)}`} label="per 7×7 Maps grid" caption="49 points on a scheduled scan" />
          <Stat value="$0" label="markup from us" caption="No monthly fee. No usage cap on your keys." />
        </div>
        <span className="text-[13px] text-dim">
          Vendors set these rates and can change them. The app shows the estimate before every scan and the actual cost after. Prices read on the
          vendors&apos; pricing pages on {PRICES_READ_ON}.
        </span>
      </div>
    </Band>
  );
}

const PROBLEMS = [
  "Monthly plans and credits that expire, whether you used them or not.",
  "AI scans billed as premium credits, so you check less often than you should.",
  "Tracker in one tool, audit in another, client reports in a third.",
  "You pay every month whether you won the client or not.",
];

/** 9.5 Problem. */
export function Problem() {
  return (
    <section className="container-page section-y grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-[clamp(40px,6vw,80px)]">
      <div className="flex flex-col gap-[22px]">
        <Eyebrow>The problem</Eyebrow>
        <h2 className="text-h2 m-0">You&apos;re renting your AI visibility tracker.</h2>
        <p className="text-lead m-0">
          AI visibility tracking now lives inside monthly local SEO plans. They are good tools, but the meter never stops: a plan for the tracker,
          credits for the scans, another tool for the reports you use to win clients.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {PROBLEMS.map((p) => (
          <Card key={p} className="flex gap-4 rounded-[14px] px-[22px] py-[18px] text-[17px] leading-normal">
            <span aria-hidden className="font-semibold text-danger">✕</span>
            <span>{p}</span>
          </Card>
        ))}
        <p className="mt-4 mb-0 border-l-2 border-fg py-[6px] pl-6 text-[clamp(20px,2vw,26px)] leading-[1.35] font-medium tracking-[-0.02em]">
          The data costs cents. You&apos;ve been paying for the meter.
        </p>
      </div>
    </section>
  );
}

/** 9.6 Fix. */
export function Fix() {
  const g3 = estimateAiGrid(3, ENGINES).rangeUsd;
  const boxes = [
    { n: "01", title: "RankbyAI", body: "Paid once. Runs the scans, audits, Fix Kits and reports.", hi: false },
    { n: "02", title: "Your API keys", body: "DataForSEO, OpenAI, Perplexity, Gemini. Pay-as-you-go, billed to you by each vendor.", hi: true },
    { n: "03", title: "At cost", body: `About $${g3.low.toFixed(2)}–${g3.high.toFixed(2)} per 3×3 AI grid [estimate]. We add nothing on top.`, hi: false },
  ];
  return (
    <Band>
      <div className="container-page section-y flex flex-col items-center gap-6 text-center">
        <Eyebrow>The fix</Eyebrow>
        <h2 className="text-h2 m-0 max-w-[900px]">Bring your keys. Pay cost.</h2>
        <p className="text-lead m-0 max-w-[780px]">
          RankbyAI connects to your own vendor accounts. Every AI answer and Maps lookup runs on your keys at the vendor&apos;s price. We never sit
          between you and the bill, so we never need to cap your usage or charge you for it.
        </p>
        <div className="mt-6 flex w-full flex-wrap items-center justify-center gap-[14px]">
          {boxes.map((b, i) => (
            <div key={b.n} className="contents">
              {i > 0 ? <span aria-hidden className="hidden h-px w-7 bg-[#333] lg:block" /> : null}
              <div
                className={
                  b.hi
                    ? "flex max-w-[320px] flex-[1_1_240px] flex-col gap-2 rounded-2xl border border-fg bg-surface-2 p-6 text-left shadow-[0_0_0_6px_var(--rb-line)]"
                    : "flex max-w-[320px] flex-[1_1_240px] flex-col gap-2 rounded-2xl border border-border bg-surface p-6 text-left"
                }
              >
                <span className="font-mono text-[12px] font-medium text-dim">{b.n}</span>
                <span className="text-[19px] font-semibold">{b.title}</span>
                <span className="text-[15px] leading-normal text-muted-foreground">{b.body}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="m-0 text-[15px] text-muted-foreground">
          No keys?{" "}
          <Link href="/#packs" className="text-fg underline underline-offset-[3px]">Buy included scans instead</Link>.
        </p>
      </div>
    </Band>
  );
}

const HOW = [
  {
    title: "Add your keys.",
    body: "Paste a key, we test it and show the balance where the vendor exposes one. Keys are encrypted before they are stored. No keys? Buy included scans and skip this step.",
  },
  { title: "Add a business.", body: "Search it by name and confirm the Google listing." },
  { title: "Run a check.", body: "Pick a prompt and a grid, see the cost, hit run. The grid fills in point by point." },
];

/** 9.8 How it works. */
export function HowItWorks() {
  return (
    <Band id="how">
      <div className="container-page section-y flex flex-col gap-[22px]">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="text-h2 m-0 max-w-[760px]">From signup to first AI grid in about five minutes.</h2>
        <ol className="m-0 mt-7 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-[18px] p-0">
          {HOW.map((h, i) => (
            <li key={h.title} className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface p-8">
              <span aria-hidden className="grid size-11 place-items-center rounded-full border-2 border-fg font-semibold">{i + 1}</span>
              <span className="mt-[10px] text-[21px] font-semibold">{h.title}</span>
              <span className="text-[16px] leading-[1.55] text-muted-foreground">{h.body}</span>
            </li>
          ))}
        </ol>
      </div>
    </Band>
  );
}

const SECURITY = [
  { title: "Encrypted at rest", body: "AES-256-GCM, before the key touches the database." },
  { title: "Write-only", body: "Replace or delete it any time. Nobody can read it back, including you." },
  { title: "Server-side only", body: "Keys are used only from our servers. They never reach a browser." },
  { title: "Cost before, cost after", body: "Estimate shown before every scan, actual cost logged after." },
];

/** 9.9 Key security. These four statements are enforced in code and covered by tests. */
export function KeySecurity() {
  return (
    <section className="container-page section-y grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-start gap-[clamp(32px,5vw,64px)]">
      <div className="flex flex-col gap-[22px]">
        <Eyebrow>Key security</Eyebrow>
        <h2 className="text-h2 m-0">Your keys stay yours.</h2>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-4">
        {SECURITY.map((s, i) => (
          <Card key={s.title} className="flex flex-col gap-[10px] p-7">
            <span className="font-mono text-[12px] font-medium text-dim">/0{i + 1}</span>
            <span className="text-[19px] font-semibold">{s.title}</span>
            <span className="text-[15px] leading-normal text-muted-foreground">{s.body}</span>
          </Card>
        ))}
      </div>
    </section>
  );
}

/** 9.10 API + MCP. */
export function ApiMcp() {
  return (
    <Band>
      <div className="container-page section-y grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-center gap-[clamp(32px,5vw,64px)]">
        <div className="flex flex-col gap-[22px]">
          <Eyebrow>API + MCP</Eyebrow>
          <h2 className="text-h2 m-0">Hand it to your AI agent.</h2>
          <p className="text-lead m-0">
            Every feature is in the REST API and the MCP server. Connect Claude, Cursor, ChatGPT or your own scripts and let the agent run checks,
            audits and prospect reports. Paid actions show the estimate first and need an explicit confirm.
          </p>
          <Link href="/docs/api" className="text-[15px] font-medium text-fg underline underline-offset-[3px]">Read the API docs →</Link>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface font-mono text-[14px] leading-[1.7]">
          <div className="flex items-center justify-between border-b border-border px-[18px] py-3 text-[13px] text-muted-foreground">
            <span>MCP · rankbyai.live</span>
            <SampleTag />
          </div>
          <div className="flex flex-col gap-[14px] px-[22px] py-5">
            <div><span className="text-dim">you › </span>Check whether AI recommends my dentist client in Austin and tell me what to fix first.</div>
            <div className="text-muted-foreground">→ runs a 3×3 AI grid on your keys</div>
            <div className="text-muted-foreground">→ runs a Local AI Audit</div>
            <div>
              <span className="text-dim">agent › </span>Named at 2 of 9 spots, only by Gemini. Fix the P0 first: the phone on the site doesn&apos;t match the
              profile. Then get listed on the two directories all three engines cite.
            </div>
          </div>
        </div>
      </div>
    </Band>
  );
}

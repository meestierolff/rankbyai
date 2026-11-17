import type { ReactNode } from "react";
import { Check, Chevron, Eyebrow, MockSidebar, MonoPill, PriorityBadge, SampleTag, ScoreRing, WindowBar, scoreColor } from "@/components/brand/primitives";
import { SAMPLE, SAMPLE_AUDIT, SAMPLE_PROSPECTS } from "@/lib/sample-data";
import { AiGridMock, FixKitMock, MapsGridMock } from "./feature-mocks";

function FeatureBlock({
  n, name, sub, title, lead, mock, bullets, flush = true, last,
}: { n: string; name: string; sub: string; title: string; lead: string; mock: ReactNode; bullets: string[]; flush?: boolean; last?: boolean }) {
  return (
    <section className={`container-page flex flex-col gap-7 pt-[clamp(72px,9vw,120px)] ${last ? "pb-[var(--rb-section-y)]" : ""}`}>
      <div className="flex items-center gap-3 text-[17px]">
        <MonoPill>{n}</MonoPill>
        <span className="font-medium">{name}</span>
        <span className="text-dim">· {sub}</span>
      </div>
      <h3 className="text-h3 m-0 max-w-[820px]">{title}</h3>
      <p className="text-lead m-0 max-w-[760px]">{lead}</p>
      <div className="mt-5 flex flex-wrap items-end gap-[clamp(24px,4vw,56px)]">
        <div className={`min-w-0 flex-[3_1_560px] overflow-hidden rounded-3xl border border-line bg-bg-alt p-[clamp(16px,3vw,40px)] ${flush ? "pb-0" : ""}`}>{mock}</div>
        <ul className="m-0 flex flex-[1_1_300px] list-none flex-col gap-[22px] p-0 pb-5">
          {bullets.map((b) => <Check key={b}>{b}</Check>)}
        </ul>
      </div>
    </section>
  );
}

function AuditMock() {
  return (
    <div className="overflow-hidden rounded-t-xl border border-b-0 border-border bg-inset">
      <WindowBar url="rankbyai.live/app/audit" compact />
      <div className="flex">
        <MockSidebar active="Local AI Audit" />
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-[18px]">
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <div className="flex flex-col gap-[3px]">
              <span className="text-[17px] font-semibold">{SAMPLE.business}</span>
              <span className="flex flex-wrap items-center gap-2 text-[13px] text-dim"><SampleTag /> profile, website, reviews, AI answers</span>
            </div>
            <span className="rounded-[9px] border border-border-strong px-3 py-[7px] text-[13px] font-medium" aria-hidden>↻ Re-run audit</span>
          </div>
          <div className="flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-[14px]">
            <ScoreRing score={SAMPLE_AUDIT.score} size={58} label={false} />
            <div className="flex flex-col gap-[3px]">
              <span className="text-[13px] text-dim">Local AI Audit score · 92% of checks ran</span>
              <span className="text-[16px] font-semibold">{SAMPLE_AUDIT.findings.length} issues, highest impact first</span>
            </div>
          </div>
          {SAMPLE_AUDIT.findings.slice(0, 3).map((f, i) => (
            <details key={f.title} open={i === 1} className="rounded-xl border border-border bg-surface px-[14px] py-3">
              <summary className="flex items-center gap-3 text-[15px]">
                <PriorityBadge priority={f.priority} />
                <span className="flex-1">{f.title}</span>
                <Chevron />
              </summary>
              <div className="flex flex-col gap-[6px] pt-3 pb-[2px] pl-[46px] text-[14px] leading-normal text-dim">
                <span><span className="text-fg">Evidence:</span> {f.evidence}</span>
                <span><span className="text-fg">Fix:</span> {f.fix}</span>
              </div>
            </details>
          ))}
          <div className="h-2" />
        </div>
      </div>
    </div>
  );
}

function ProspectsMock() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-inset">
      <div className="flex flex-wrap items-center justify-between gap-[10px] border-b border-line px-4 py-[14px]">
        <div className="flex flex-wrap items-center gap-[6px] font-mono text-[12px] font-medium">
          {["niche: dentists", "city: Austin, TX", "AI 3×3 + Maps 5×5"].map((c) => (
            <span key={c} className="rounded-[7px] border border-border bg-[#1a1a1a] px-[10px] py-[6px]">{c}</span>
          ))}
          <SampleTag />
        </div>
        <span className="font-mono text-[12px] font-medium text-g1">25 reports ready</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="font-mono text-[11px] font-medium tracking-[0.04em] text-dim uppercase">
              {["Business", "AI named", "Maps avg", "Audit", "Report"].map((h) => <th key={h} scope="col" className="px-4 py-[10px] font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {SAMPLE_PROSPECTS.map((r) => (
              <tr key={r.name} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 font-mono text-[13px] font-medium">{r.ai}</td>
                <td className="px-4 py-3 font-mono text-[13px] font-medium">{r.maps}</td>
                <td className="px-4 py-3">
                  <span className="rounded-[5px] px-[7px] py-[3px] font-mono text-[12px] font-semibold text-bg" style={{ background: scoreColor(r.audit) }}>{r.audit}</span>
                </td>
                <td className="px-4 py-3 font-mono text-[12px] font-medium text-muted-foreground">{r.link} · pdf</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 border-t border-line px-4 py-3 text-[13px] leading-normal text-muted-foreground">
        <span className="text-fg">Pitch opener:</span> “At 7 of 9 spots around Austin, AI assistants named Smile Dental instead of you; you have 38
        reviews vs a map-pack median of 112.”
      </p>
    </div>
  );
}

/** 9.7 Modules: "Four tools, one payment". */
export function Features() {
  return (
    <>
      <section id="features" className="container-page flex flex-col gap-4 pt-[var(--rb-section-y)]">
        <Eyebrow>Four tools, one payment</Eyebrow>
        <h2 className="text-h2 m-0">Track it. Audit it. Fix it. Sell it.</h2>
      </section>

      <FeatureBlock
        n="01" name="Track" sub="AI Visibility Tracker"
        title="See which businesses AI assistants recommend, street by street."
        lead="One prompt, asked of three AI engines at every point of a map grid. Click any point to read the full answer, who was named in what order, and which sources were cited."
        mock={<AiGridMock />}
        bullets={[
          "1×1, 3×3 or 5×5 AI grids with your own radius",
          "Three engines per point: ChatGPT, Perplexity and Gemini, through their official APIs",
          "Click any point for the full answer, the order of names and the cited sources",
          "Mention rate, average position and Share of AI Voice",
          "Scheduled re-checks with history and side-by-side compare",
          "Most-cited sources: the list of where to get listed",
        ]}
      />

      <FeatureBlock
        n="02" name="Rank" sub="Maps Grid Tracker"
        title="Your Google Maps rank on the same map."
        lead="The classic geo-grid, from 3×3 to 9×9, next to the AI grid for the same business. See where you are top 3 on Maps but missing from AI answers."
        mock={<MapsGridMock />}
        bullets={[
          "Grids from 3×3 to 9×9 with your own radius",
          "Top 20 results at any pin, with you highlighted",
          "Competitor overlay: recolor the grid by any rival's rank",
          "Average rank, top-3 share and Share of Local Voice",
          "Schedules, history and before/after compare",
          "Combined view: Maps rank and AI mentions on one map",
        ]}
      />

      <FeatureBlock
        n="03" name="Audit" sub="Local AI Audit + Fix Kit"
        title="What's holding the business back, in priority order."
        lead="One score out of 100 across identity, profile, website, reviews, AI presence and competition. Every finding comes with its evidence and a fix. Checks that could not run are left out of the score and listed."
        flush={false}
        mock={<div className="flex flex-col gap-6"><AuditMock /><FixKitMock /></div>}
        bullets={[
          "One 0–100 score with published category weights",
          "P0 to P3 findings, each with evidence and a fix",
          "Review target math: how many reviews a month to reach the map pack median",
          "Missing service pages, found on competitor sites, with the URL as evidence",
          "Page math: services × areas within 10 miles",
          "Fix Kit: AI-ready description, FAQ, LocalBusiness + FAQ schema, llms.txt draft",
        ]}
      />

      <FeatureBlock
        n="04" name="Sell" sub="Prospect Reports"
        title="Win the client before the first call."
        lead="Pick a niche and a city. RankbyAI finds the businesses, checks each one and builds a white-label report with a live link, a PDF and a factual pitch opener for your own outreach."
        flush={false}
        last
        mock={<ProspectsMock />}
        bullets={[
          "Niche + city in, dozens of businesses out",
          "One white-label report each: AI grid, Maps grid, top fixes, pitch opener",
          "Live share link plus PDF, under your logo and colors",
          "CSV export for your own outreach tool",
          "Bulk runs through the API or the MCP server",
        ]}
      />
    </>
  );
}

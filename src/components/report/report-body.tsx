import type { CSSProperties, ReactNode } from "react";
import { AiDisclaimer, PriorityBadge, ScoreRing, scoreColor, type Priority } from "@/components/brand/primitives";
import { Bezel, DotMark, LpWordmark, creamClass, outlineClass } from "@/components/marketing/lp";
import { NOT_AFFILIATED } from "@/lib/copy";
import { ENGINE_LABEL } from "@/lib/pricing-constants";
import { cn } from "@/lib/utils";
import { CopyLinkButton, PdfLink } from "./actions";
import {
  brandTextOnDark, dataDates, fmtDay, headlineStats, isHex6, orList, placeOf, quoteBlocks, splitBlocks, textOn, verdict, wordCount,
  type HeadlineStat, type QuoteBlock,
} from "./derive";
import { MapSection } from "./map-section";
import { nearestPoint } from "./model";
import "./report.css";
import type { QuotedAnswer, ReportView } from "./types";

/**
 * The public report (/r/{slug}): what an agency forwards and a business owner reads. It leads with
 * the finding, then shows where (the map), who instead, the proof (verbatim answers), where the
 * assistants look, what to fix, and what to do next. Pure: everything comes from `view`.
 */
export function ReportBody({ view, pdfHref, siteUrl }: { view: ReportView; pdfHref: string | null; siteUrl: string }) {
  const { business, brand, ai, maps, audit } = view;
  const site = siteUrl.replace(/\/$/, "");
  const whiteLabel = !!brand.name;
  const showRankbyai = !brand.hideRankbyai && !whiteLabel;
  const accent = brandTextOnDark(brand.color) ?? (whiteLabel || brand.hideRankbyai ? "var(--rb-fg-2)" : "var(--lp-accent-text)");
  const eyebrowStyle: CSSProperties = { color: accent };
  const stats = headlineStats(view);
  const aiGrid = ai && ai.n > 1 ? ai : null;
  const mapsGrid = maps && !maps.single && maps.n > 1 ? maps : null;
  const target = business.lat != null && business.lng != null ? { lat: business.lat, lng: business.lng } : null;
  const nothing = !ai && !maps && !audit;
  const instead = insteadRows(view);
  const said = !!ai?.quote && ai.quote.answers.some((a) => a.state !== "no_answer");
  // Sections are numbered in the order they appear; absent sections take no number.
  const shown = { map: !!(aiGrid || mapsGrid), instead: !!instead, said, maps1: !!maps?.single, sources: !!ai?.sources.length, fix: !!audit };
  const order = (Object.keys(shown) as (keyof typeof shown)[]).filter((k) => shown[k]);
  const num = (k: keyof typeof shown) => String(order.indexOf(k) + 1).padStart(2, "0");

  return (
    <div className={"rb-report min-h-dvh bg-lp-bg text-lp-fg"}>
      <header className="border-b border-lp-line">
        <div className="container-lp-wide flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
          <Brand view={view} site={site} />
          <div className="flex items-center gap-4">
            <span className="hidden font-mono text-[12px] text-dim sm:inline">Data from {dataDates(view)}</span>
            {pdfHref && !nothing ? <PdfLink href={pdfHref} kind={view.kind} className={cn(outlineClass("px-3 py-[7px] text-[13.5px] whitespace-nowrap"), "print:hidden")} /> : null}
          </div>
        </div>
      </header>

      <main className="container-lp-wide flex flex-col gap-[clamp(64px,9vw,112px)] pt-[clamp(36px,6vw,72px)] pb-[clamp(56px,8vw,96px)]">
        {/* ── The finding ── */}
        <section aria-labelledby="report-title" className="flex flex-col gap-7">
          <div className="flex flex-col gap-4">
            <span className="font-mono text-[12px] leading-none tracking-[0.14em] uppercase" style={eyebrowStyle}>
              {view.kind === "free_check" ? "Free AI visibility check" : "AI visibility report"}
            </span>
            <h1 id="report-title" className={cn("m-0 font-display leading-[1.02] font-extrabold tracking-[-0.025em] break-words text-balance", business.name.length > 40 ? "text-[clamp(28px,4.2vw,46px)]" : "text-[clamp(32px,5.4vw,62px)]")}>
              {business.name}
            </h1>
            <p className="m-0 text-[17px] text-lp-muted">
              {[business.category, placeOf(view)].filter(Boolean).join(" · ")}
              <span className="mt-1 block font-mono text-[12.5px] text-dim sm:hidden">Data from {dataDates(view)}</span>
            </p>
          </div>
          <p className="m-0 max-w-[900px] text-[clamp(20px,2.4vw,28px)] leading-[1.35] font-medium tracking-[-0.01em] text-pretty text-lp-fg-2">{verdict(view)}</p>
          {view.watermark ? (
            <p role="note" className="m-0 max-w-[720px] rounded-xl border border-lp-border-2 bg-lp-surface px-4 py-3 text-[14px] leading-normal text-lp-muted">
              This is a free check of one point: the business location. A full report checks a grid of points around the business and audits its profile and website.
            </p>
          ) : null}
          {stats.length ? (
            <div className="flex flex-col gap-3">
              <Bezel className={stats.length === 1 ? "max-w-[520px]" : undefined} innerClassName={cn("grid grid-cols-1 divide-y divide-lp-line sm:divide-x sm:divide-y-0", stats.length === 3 ? "sm:grid-cols-3" : stats.length === 2 ? "sm:grid-cols-2" : "")}>
                {stats.map((s) => <Stat key={s.key} stat={s} />)}
              </Bezel>
              {ai ? <AiDisclaimer className="m-0 px-1" /> : null}
            </div>
          ) : null}
          {nothing ? <p className="m-0 text-[17px] text-lp-muted">This report has no completed checks yet. The link will show them once they finish.</p> : null}
        </section>

        {/* ── The map ── */}
        {aiGrid || mapsGrid ? (
          <section aria-labelledby="map-h" className="flex flex-col gap-6">
            <SectionHead id="map-h" n={num("map")} eyebrow="The map" style={eyebrowStyle} title={business.name.length > 40 ? "Where the business shows up" : `Where ${business.name} shows up`}
              lead={`Each dot is one point on a grid around the business. From every point ${aiGrid && mapsGrid ? "the AI assistants were asked for a recommendation and Google Maps was searched" : aiGrid ? "the AI assistants were asked for a recommendation" : "Google Maps was searched"}, so you can see where the business is found and where it is not.`} />
            <Bezel large>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-lp-line px-[18px] py-[14px]">
                <span className="text-[15px] font-medium text-lp-fg">
                  {aiGrid && mapsGrid && aiGrid.n !== mapsGrid.n ? `AI ${aiGrid.n}×${aiGrid.n} · Google Maps ${mapsGrid.n}×${mapsGrid.n} grid` : `${(aiGrid ?? mapsGrid)!.n}×${(aiGrid ?? mapsGrid)!.n} grid around the business`}
                </span>
                {radiusText(aiGrid?.radiusMiles ?? mapsGrid?.radiusMiles ?? null) ? <span className="font-mono text-[12px] text-dim">{radiusText(aiGrid?.radiusMiles ?? mapsGrid?.radiusMiles ?? null)}</span> : null}
              </div>
              <MapSection
                businessName={business.name}
                pin={target ?? aiGrid?.center ?? mapsGrid?.center ?? null}
                ai={aiGrid ? {
                  n: aiGrid.n, points: aiGrid.points,
                  initial: nearestPoint(aiGrid.points, target ?? aiGrid.center, aiGrid.n)?.idx ?? null,
                  caption: `${orList(aiGrid.engines.map((e) => e.label), "and")} were asked for ${aiGrid.service ? `a ${aiGrid.service} recommendation` : "a recommendation"} at every point, with the same question, on ${fmtDay(aiGrid.date)}.`,
                } : null}
                maps={mapsGrid ? {
                  n: mapsGrid.n, points: mapsGrid.points, keyword: mapsGrid.keyword,
                  initial: nearestPoint(mapsGrid.points, target ?? mapsGrid.center, mapsGrid.n)?.idx ?? null,
                  caption: `Google Maps results for “${mapsGrid.keyword ?? ""}” at every point, on ${fmtDay(mapsGrid.date)}.`,
                } : null}
              />
              {aiGrid ? <AiDisclaimer className="m-0 border-t border-lp-line px-[18px] py-3 print:hidden" /> : null}
            </Bezel>
          </section>
        ) : null}

        {/* ── Who instead ── */}
        {instead ? <Instead view={view} rows={instead} n={num("instead")} eyebrowStyle={eyebrowStyle} /> : null}

        {/* ── The proof ── */}
        {said && ai?.quote ? (
          <section aria-labelledby="said-h" className="flex flex-col gap-6">
            <SectionHead id="said-h" n={num("said")} eyebrow="The proof" style={eyebrowStyle} title="What the AI said"
              lead={<>
                {ai.n === 1 ? "Asked at the business location" : `Asked at point ${ai.quote.pointName}${ai.quote.area ? ` (${ai.quote.area})` : ""}, ${ai.quote.atBusiness ? "where the business is" : "the checked point nearest the business"},`} on {fmtDay(ai.date)}. Quoted exactly as each assistant answered{ai.quote.answers.some((a) => a.names.some((x) => x.you)) ? <>; <mark className="rounded-[4px] bg-you-tint px-1 text-g1">{business.name}</mark> is highlighted where it appears</> : null}.
              </>} />
            {ai.quote.prompt ? (
              <figure className="m-0 flex flex-col gap-2 rounded-2xl border border-lp-border-2 bg-lp-surface px-5 py-4">
                <figcaption className="font-mono text-[12px] tracking-[0.1em] text-dim uppercase">The question, as sent to every assistant</figcaption>
                <blockquote className="m-0 font-mono text-[15px] leading-[1.55] text-lp-fg">“{ai.quote.prompt}”</blockquote>
              </figure>
            ) : null}
            <div className={cn("grid grid-cols-1 gap-4", ai.quote.answers.length >= 3 ? "lg:grid-cols-3" : ai.quote.answers.length === 2 ? "md:grid-cols-2" : "")}>
              {ai.quote.answers.map((a) => <AnswerCard key={a.engine} a={a} businessName={business.name} />)}
            </div>
            <AiDisclaimer className="m-0" />
          </section>
        ) : null}

        {/* ── Free check: Google Maps at the business ── */}
        {maps?.single ? (
          <section aria-labelledby="maps1-h" className="flex flex-col gap-6">
            <SectionHead id="maps1-h" n={num("maps1")} eyebrow="Google Maps" style={eyebrowStyle} title="Google Maps at the business location"
              lead={`The local results for “${maps.keyword ?? ""}” at the business location on ${fmtDay(maps.date)}.`} />
            <ol className="m-0 flex max-w-[640px] list-none flex-col gap-[2px] rounded-2xl border border-lp-border-2 bg-lp-surface p-3">
              {maps.single.top.map((t) => {
                const you = t.rank === maps.single!.rank;
                return (
                  <li key={t.rank} className={cn("flex items-center gap-3 rounded-[9px] px-3 py-[9px] text-[15px]", you && "bg-you-tint")}>
                    <span className="w-6 font-mono text-[13px] text-dim">{t.rank}</span>
                    <span className={you ? "font-medium text-g1" : "text-lp-fg-2"}>{t.name}</span>
                    {you ? <span className="ml-auto font-mono text-[12px] text-g1">this business</span> : null}
                  </li>
                );
              })}
              {maps.single.rank == null || maps.single.rank > (maps.single.top.at(-1)?.rank ?? 0) ? (
                <li className="px-3 py-[9px] text-[14px] text-lp-muted">{maps.single.rank != null && maps.single.rank <= 20 ? `${business.name} is at #${maps.single.rank}.` : `${business.name} is not in the top 20.`}</li>
              ) : null}
            </ol>
          </section>
        ) : null}

        {/* ── Where AI looks ── */}
        {ai && ai.sources.length ? (
          <section aria-labelledby="sources-h" className="flex flex-col gap-6">
            <SectionHead id="sources-h" n={num("sources")} eyebrow="Where AI looks" style={eyebrowStyle} title="Where AI gets its answers"
              lead={`The sites the assistants cited most while answering. These are the first places to check that ${business.name} is listed, with correct details and recent reviews.`} />
            <ol className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
              {ai.sources.map((s, i) => (
                <li key={s.domain} className="flex items-start gap-4 rounded-2xl border border-lp-border-2 bg-lp-surface px-5 py-4">
                  <span className="pt-[2px] font-mono text-[13px] text-dim">{String(i + 1).padStart(2, "0")}</span>
                  <div className="flex min-w-0 flex-col gap-[6px]">
                    <span className="font-mono text-[15px] font-medium break-all text-lp-fg">{s.domain}</span>
                    <span className="text-[14px] text-lp-muted">
                      Cited in {s.count} of {ai.answersDone} {ai.answersDone === 1 ? "answer" : "answers"}{s.engines.length ? ` · ${s.engines.join(", ")}` : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
            <AiDisclaimer className="m-0" />
          </section>
        ) : null}

        {/* ── What to fix ── */}
        {audit ? (
          <section aria-labelledby="fix-h" className="flex flex-col gap-6">
            <SectionHead id="fix-h" n={num("fix")} eyebrow="Local AI Audit" style={eyebrowStyle} title="Fix these first"
              lead={`Checks of the business's Google profile and website on ${fmtDay(audit.date)}, highest priority first.`} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="flex flex-row items-center gap-5 self-start rounded-2xl border border-lp-border-2 bg-lp-surface p-5 lg:flex-col lg:items-start">
                <ScoreRing score={audit.score} size={112} />
                <div className="flex flex-col gap-1">
                  <span className="text-[17px] font-semibold">Audit score {audit.score}/100</span>
                  <span className="text-[14px] leading-snug text-lp-muted">P0: fix first. P1: fix next.</span>
                </div>
              </div>
              {audit.findings.length ? (
                <ol className="m-0 flex list-none flex-col gap-3 p-0">
                  {audit.findings.map((f, i) => (
                    <li key={`${f.priority}-${i}`} className="flex items-start gap-4 rounded-2xl border border-lp-border-2 bg-lp-surface px-5 py-4">
                      {f.priority in { P0: 1, P1: 1, P2: 1, P3: 1 } ? <PriorityBadge priority={f.priority as Priority} className="mt-[3px] shrink-0" /> : null}
                      <div className="flex min-w-0 flex-col gap-[6px]">
                        <h3 className="m-0 text-[16px] leading-snug font-semibold text-lp-fg">{f.title}</h3>
                        {f.fix ? <p className="m-0 text-[15px] leading-[1.55] text-lp-muted">{f.fix}</p> : null}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="m-0 self-center text-[16px] text-lp-muted">No high-priority issues were found.</p>
              )}
            </div>
          </section>
        ) : null}

        {/* ── What happens next ── */}
        <NextSteps view={view} site={site} pdfHref={pdfHref} showRankbyai={showRankbyai} eyebrowStyle={eyebrowStyle} nothing={nothing} />

        {/* ── Method ── */}
        <section aria-labelledby="method-h" className="flex flex-col gap-6 border-t border-lp-line pt-[clamp(40px,6vw,64px)]">
          <h2 id="method-h" className="m-0 text-[22px] font-semibold tracking-[-0.02em]">How this report was made</h2>
          <dl className="m-0 grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
            {ai ? (
              <MethodItem term="AI assistants">
                {ai.n === 1 ? "At the business location" : `At ${ai.pointsChecked} ${ai.pointsChecked === 1 ? "point" : "points"} of a ${ai.n}×${ai.n} grid${ai.radiusMiles ? ` within ${fmtMiles(ai.radiusMiles)} of the business` : ""}`}, on {fmtDay(ai.date)}, through the official APIs: {orList(ai.engines.map((e) => `${ENGINE_LABEL[e.key]?.api ?? e.label} (${e.label})`), "and")}. Every assistant got the same question{ai.n > 1 ? "; only the area name changes between points" : ""}.
                {ai.engines.some((e) => !e.available) ? ` ${orList(ai.engines.filter((e) => !e.available).map((e) => e.label))} did not answer and is left out.` : ""}
              </MethodItem>
            ) : null}
            {maps ? (
              <MethodItem term="Google Maps">
                {maps.single ? "At the business location" : `At ${maps.pointsDone} ${maps.pointsDone === 1 ? "point" : "points"} of a ${maps.n}×${maps.n} grid${maps.radiusMiles ? ` within ${fmtMiles(maps.radiusMiles)} of the business` : ""}`}, on {fmtDay(maps.date)}: the local results for “{maps.keyword}”, via DataForSEO. A business outside the top 20 counts as not ranked.
              </MethodItem>
            ) : null}
            {audit ? <MethodItem term="Local AI Audit">On {fmtDay(audit.date)}: checks of the business&apos;s Google profile and website, scored out of 100.</MethodItem> : null}
            <MethodItem term="What is counted">
              Fixed points and dates. Points with no result (!) and areas left out of the scan (dashed) are not counted in any number above{ai ? <>, and an assistant that did not answer at a point is not counted as &ldquo;not named&rdquo;</> : null}
              {(ai?.pointsFailed || ai?.pointsSkipped || maps?.pointsFailed || maps?.pointsSkipped) ? ` (${countNote(view)})` : ""}.
            </MethodItem>
            <MethodItem term="Limits">
              {ai ? <>AI answers vary between runs, places and time; API results can differ from what people see in the consumer apps. </> : null}
              This is a snapshot of the dates above, not a guarantee of future results.
            </MethodItem>
          </dl>
        </section>
      </main>

      <footer className="border-t border-lp-line">
        <div className="container-lp-wide flex flex-col gap-2 py-8 text-[13px] leading-normal text-dim sm:flex-row sm:items-center sm:justify-between">
          <span>{whiteLabel ? `Prepared by ${brand.name}.` : showRankbyai ? <>Report by <a href={site} className="text-lp-fg-2 underline underline-offset-[3px]">RankbyAI</a>.</> : "AI visibility report."}</span>
          {!brand.hideRankbyai ? <span>{NOT_AFFILIATED}</span> : null}
        </div>
      </footer>
    </div>
  );
}

// ───────────────────────── parts ─────────────────────────

const fmtMiles = (m: number) => `${Number.isInteger(m) ? m : m.toFixed(1)} ${m === 1 ? "mile" : "miles"}`;
const radiusText = (m: number | null) => (m ? `${fmtMiles(m)} around the business` : undefined);

function countNote(view: ReportView): string {
  const parts: string[] = [];
  const add = (what: string, failed?: number, skipped?: number) => {
    if (failed) parts.push(`${what}: ${failed} without a result`);
    if (skipped) parts.push(`${what}: ${skipped} not checked`);
  };
  add("AI", view.ai?.pointsFailed, view.ai?.pointsSkipped);
  add("Google Maps", view.maps?.pointsFailed, view.maps?.pointsSkipped);
  return parts.join("; ");
}

function Brand({ view, site }: { view: ReportView; site: string }) {
  const { brand } = view;
  if (brand.name || brand.logoUrl) {
    return (
      <span className="flex min-w-0 items-center gap-3">
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt={brand.name ? `${brand.name} logo` : "Agency logo"} className="h-9 w-auto max-w-[160px] object-contain" />
        ) : null}
        {brand.name ? <span className="truncate text-[17px] font-semibold">{brand.name}</span> : null}
      </span>
    );
  }
  if (brand.hideRankbyai) return <span className="text-[15px] font-medium text-lp-fg-2">AI visibility report</span>;
  return (
    <a href={site} className="flex items-center gap-[10px] text-lp-fg no-underline" aria-label="RankbyAI home">
      <DotMark size={22} />
      <LpWordmark />
    </a>
  );
}

function SectionHead({ id, n, eyebrow, title, lead, style }: { id: string; n: string; eyebrow: string; title: string; lead?: ReactNode; style: CSSProperties }) {
  return (
    <div className="flex flex-col gap-4">
      <span className="font-mono text-[12px] leading-none tracking-[0.14em] uppercase" style={style}>
        <span className="text-dim">{n}</span>&nbsp;&nbsp;{eyebrow}
      </span>
      <h2 id={id} className="m-0 max-w-[900px] text-[clamp(28px,3.6vw,44px)] leading-[1.04] font-semibold tracking-[-0.04em] break-words text-balance">{title}</h2>
      {lead ? <p className="m-0 max-w-[760px] text-[17px] leading-[1.6] text-pretty text-lp-muted">{lead}</p> : null}
    </div>
  );
}

function Stat({ stat }: { stat: HeadlineStat }) {
  const total = stat.of ? Number(stat.of) : 0;
  const filled = Number(stat.value);
  const pips = stat.key !== "audit" && total > 0 && total <= 30;
  return (
    <div className="flex flex-col gap-4 p-[clamp(18px,2.4vw,26px)]">
      <span className="font-mono text-[12px] leading-none tracking-[0.12em] text-dim uppercase">{stat.label}</span>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[clamp(44px,5.2vw,64px)] leading-[0.9] font-extrabold tracking-[-0.03em] tabular-nums">{stat.value}</span>
        {stat.of ? <span className="font-mono text-[20px] font-medium text-dim">/{stat.of}</span> : null}
      </div>
      {pips ? (
        <span aria-hidden className="flex flex-wrap gap-[5px]">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className="rb-data size-[10px] rounded-full" style={{ background: i < filled ? "var(--rb-g1)" : "var(--rb-track)" }} />
          ))}
        </span>
      ) : stat.share != null ? (
        <span aria-hidden className="block h-[8px] w-full overflow-hidden rounded-full bg-track">
          <span className="rb-data block h-full rounded-full" style={{ width: `${Math.round(stat.share * 100)}%`, background: stat.key === "audit" ? scoreColor(filled) : "var(--rb-g1)" }} />
        </span>
      ) : null}
      <p className="m-0 text-[15px] leading-snug text-lp-muted">{stat.caption}</p>
    </div>
  );
}

type InsteadRow = { name: string; you: boolean; value: number; note: string | null };

/** Rows for "who instead": AI by points (with answers), Google Maps by top-3 points. Null when there is nothing to compare. */
function insteadRows(view: ReportView): { ai: InsteadRow[] | null; maps: InsteadRow[] | null } | null {
  const { ai, maps, business } = view;
  const aiRows = ai && ai.n > 1 && ai.pointsChecked > 0 && ai.recommended.some((r) => !r.you)
    ? ai.recommended.map((r) => ({ name: r.name, you: r.you, value: r.points, note: `in ${r.answers} of ${ai.answersDone} answers` }))
    : null;
  const mapsRows = maps && !maps.single && maps.pointsDone > 0 && maps.competitors.length
    ? [...maps.competitors.slice(0, 5).map((c) => ({ name: c.name, you: false, value: c.top3Points, note: null })), { name: business.name, you: true, value: maps.top3Points, note: null }]
        .sort((a, b) => b.value - a.value || (a.you ? -1 : b.you ? 1 : 0))
    : null;
  return aiRows || mapsRows ? { ai: aiRows, maps: mapsRows } : null;
}

function Instead({ view, rows, n, eyebrowStyle }: { view: ReportView; rows: NonNullable<ReturnType<typeof insteadRows>>; n: string; eyebrowStyle: CSSProperties }) {
  const { ai, maps, business } = view;
  return (
    <section aria-labelledby="instead-h" className="flex flex-col gap-6">
      <SectionHead id="instead-h" n={n} eyebrow="Who instead" style={eyebrowStyle} title={rows.ai ? "Who AI recommends instead" : "Who ranks instead"}
        lead={`${rows.ai ? "The businesses the assistants named most often across the grid" : "The businesses in the Google Maps top 3 most often across the grid"}, and at how many points. ${business.name} is in the list for comparison.`} />
      <div className={cn("grid grid-cols-1 gap-4", rows.ai && rows.maps && "lg:grid-cols-2")}>
        {rows.ai && ai ? <RankList title="Named by AI assistants" sub={`Points where at least one assistant named it, of ${ai.pointsChecked}`} total={ai.pointsChecked} rows={rows.ai} /> : null}
        {rows.maps && maps ? <RankList title="In the Google Maps top 3" sub={`Points where it is in the top 3 for “${maps.keyword ?? ""}”, of ${maps.pointsDone}`} total={maps.pointsDone} rows={rows.maps} /> : null}
      </div>
      {rows.ai ? <AiDisclaimer className="m-0" /> : null}
    </section>
  );
}

function RankList({ title, sub, total, rows }: { title: string; sub: string; total: number; rows: InsteadRow[] }) {
  return (
    <div className="flex flex-col rounded-2xl border border-lp-border-2 bg-lp-surface">
      <div className="flex flex-col gap-1 border-b border-lp-line px-5 py-4">
        <h3 className="m-0 text-[16px] font-semibold">{title}</h3>
        <span className="text-[13.5px] text-lp-muted">{sub}</span>
      </div>
      <ol className="m-0 flex list-none flex-col p-2">
        {rows.map((r, i) => (
          <li key={`${r.name}-${i}`} className={cn("flex flex-col gap-2 rounded-[10px] px-3 py-3", r.you && "bg-you-tint")}>
            <div className="flex items-baseline justify-between gap-3">
              <span className={cn("min-w-0 text-[15px] leading-snug", r.you ? "font-semibold text-g1" : "text-lp-fg")}>
                {r.name}
                {r.you ? <span className="ml-2 font-mono text-[11px] font-medium tracking-[0.06em] uppercase">this business</span> : null}
              </span>
              <span className="shrink-0 font-mono text-[14px] font-semibold tabular-nums">
                {r.value}<span className="font-normal text-dim">/{total}</span>
              </span>
            </div>
            <span aria-hidden className="block h-[6px] w-full overflow-hidden rounded-full bg-track">
              <span className="rb-data block h-full rounded-full" style={{ width: `${total ? Math.round((r.value / total) * 100) : 0}%`, background: r.you ? "var(--rb-g1)" : "var(--rb-fg-2)" }} />
            </span>
            {r.note ? <span className="text-[13px] text-dim">{r.note}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function AnswerCard({ a, businessName }: { a: QuotedAnswer; businessName: string }) {
  const youNames = a.names.filter((x) => x.you).map((x) => x.name);
  const blocks = a.answer ? quoteBlocks(a.answer, [...youNames, businessName]) : [];
  const { head, rest } = splitBlocks(blocks, 300);
  const state = a.state === "named" ? { text: a.position ? `Named #${a.position}` : "Named", cls: "bg-you-tint text-g1 border-[rgba(80,200,120,0.35)]" }
    : a.state === "not_named" ? { text: "Not named", cls: "text-lp-fg-2 border-lp-border-3" }
    : { text: "No answer", cls: "text-dim border-lp-border-2" };
  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-2xl border border-lp-border-2 bg-lp-surface p-5">
      <header className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-[17px] font-semibold">{a.label}</h3>
        <span className={cn("rounded-full border px-[10px] py-[3px] font-mono text-[12px] font-semibold", state.cls)}>{state.text}</span>
      </header>
      {a.state === "no_answer" ? (
        <p className="m-0 text-[14px] text-lp-muted">This assistant did not return an answer for this check.</p>
      ) : (
        <>
          {a.names.length ? (
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[11.5px] tracking-[0.1em] text-dim uppercase">Named, in order</span>
              <ol className="m-0 flex list-none flex-col gap-[2px] p-0">
                {a.names.map((x) => (
                  <li key={`${x.position}-${x.name}`} className={cn("flex gap-[10px] rounded-[8px] px-2 py-[5px] text-[14.5px]", x.you && "bg-you-tint")}>
                    <span className="w-4 shrink-0 font-mono text-[12.5px] text-dim">{x.position}</span>
                    <span className={x.you ? "font-semibold text-g1" : "text-lp-fg-2"}>{x.name}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="m-0 text-[14px] text-lp-muted">The answer named no specific business.</p>
          )}
          {blocks.length ? (
            <div className="flex flex-col gap-2 border-t border-lp-line pt-4">
              <span className="font-mono text-[11.5px] tracking-[0.1em] text-dim uppercase">The answer</span>
              <blockquote className="m-0 flex flex-col gap-2 border-l-2 border-lp-border-3 pl-3 text-[14px] leading-[1.6] text-lp-fg-2">
                <Blocks blocks={head} />
                {rest.length ? (
                  <details className="rb-report-more">
                    <summary className="w-fit cursor-pointer text-[13.5px] font-medium text-lp-fg underline decoration-lp-border-3 underline-offset-[3px] print:hidden">
                      Read the full answer ({wordCount(a.answer ?? "")} words)
                    </summary>
                    <div className="mt-2 flex flex-col gap-2"><Blocks blocks={rest} /></div>
                  </details>
                ) : null}
                {a.answerCut ? <p className="m-0 text-[12.5px] text-dim">[The stored answer is longer; it is shortened here.]</p> : null}
              </blockquote>
            </div>
          ) : null}
          {a.cited.length ? (
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[11.5px] tracking-[0.1em] text-dim uppercase">Cited</span>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {a.cited.map((c, _i, all) => (
                  <li key={c.url}>
                    <a href={c.url} target="_blank" rel="nofollow noopener noreferrer ugc" title={c.title || c.url} className="inline-block max-w-full truncate rounded-full border border-lp-border-2 px-[10px] py-[3px] font-mono text-[12px] text-lp-muted no-underline hover:border-lp-border-3 hover:text-lp-fg">
                      {/* The domain is always the label (the title is the vendor's text). Several sources on one
                          site (Gemini cites Google Maps places) add their title after it, de-emphasised. */}
                      {c.domain}
                      {c.title && all.filter((o) => o.domain === c.domain).length > 1 ? <span className="text-dim"> · {c.title.slice(0, 40)}</span> : null}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}

function Blocks({ blocks }: { blocks: QuoteBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        const spans = b.spans.map((s, j) => {
          const body = s.bold ? <strong className={cn("font-semibold", !s.you && "text-lp-fg")}>{s.text}</strong> : s.text;
          return s.you ? <mark key={j} className="rounded-[3px] bg-you-tint px-[2px] text-g1">{body}</mark> : <span key={j}>{body}</span>;
        });
        if (b.kind === "h") return <p key={i} className="m-0 font-semibold text-lp-fg">{spans}</p>;
        if (b.kind === "li") return <p key={i} className="m-0 flex gap-2"><span className="shrink-0 font-mono text-[12.5px] leading-[1.9] text-dim">{b.marker}</span><span className="min-w-0">{spans}</span></p>;
        return <p key={i} className="m-0">{spans}</p>;
      })}
    </>
  );
}

function NextSteps({ view, site, pdfHref, showRankbyai, eyebrowStyle, nothing }: { view: ReportView; site: string; pdfHref: string | null; showRankbyai: boolean; eyebrowStyle: CSSProperties; nothing: boolean }) {
  const { brand, business } = view;
  if (brand.name) {
    const color = isHex6(brand.color) ? brand.color : null;
    return (
      <section aria-labelledby="next-h" className="rounded-[26px] border p-[clamp(24px,4vw,44px)]" style={{ borderColor: color ?? "var(--lp-border-2)", background: "linear-gradient(180deg,#121212,#0a0a0a)" }}>
        <div className="flex flex-col items-start gap-5">
          <span className="font-mono text-[12px] leading-none tracking-[0.14em] uppercase" style={eyebrowStyle}>Next step</span>
          <h2 id="next-h" className="m-0 max-w-[760px] text-[clamp(28px,3.6vw,44px)] leading-[1.04] font-semibold tracking-[-0.04em] text-balance">
            {brand.website ? `Get this fixed with ${brand.name}` : `Prepared by ${brand.name}`}
          </h2>
          <p className="m-0 max-w-[640px] text-[17px] leading-[1.6] text-lp-muted">
            {brand.name} prepared this report for {business.name}. Talk to them about the fixes above, and ask for a new check afterwards to compare.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {brand.website ? (
              <a href={brand.website} target="_blank" rel="noopener noreferrer" className={creamClass("md")} style={color ? { background: color, color: textOn(color), boxShadow: "0 8px 28px rgba(0,0,0,.4)" } : undefined}>
                <span>Contact {brand.name}</span><span aria-hidden>→</span>
              </a>
            ) : null}
            {pdfHref && !nothing ? <PdfLink href={pdfHref} kind={view.kind} className={cn(outlineClass(), "print:hidden")} /> : null}
          </div>
        </div>
      </section>
    );
  }
  const free = view.kind === "free_check";
  return (
    <section aria-labelledby="next-h" className="flex flex-col gap-6">
      <span className="font-mono text-[12px] leading-none tracking-[0.14em] uppercase" style={eyebrowStyle}>What happens next</span>
      <h2 id="next-h" className="sr-only">What happens next</h2>
      <div className={cn("grid grid-cols-1 gap-4", showRankbyai && "md:grid-cols-2")}>
        <div className="flex flex-col items-start gap-4 rounded-[22px] border border-lp-border-2 bg-[linear-gradient(180deg,#121212,#0a0a0a)] p-[clamp(22px,3vw,32px)]">
          <span className="font-mono text-[12px] tracking-[0.1em] text-dim uppercase">If this is your business</span>
          <h3 className="m-0 text-[clamp(22px,2.4vw,28px)] leading-[1.1] font-semibold tracking-[-0.03em]">Want these fixed?</h3>
          <p className="m-0 text-[16px] leading-[1.6] text-lp-muted">
            Share this report with your marketing agency or web developer. Everything they need is on this page{pdfHref && !nothing ? " and in the PDF" : ""}.
          </p>
          <div className="mt-auto flex flex-wrap gap-3 pt-2 print:hidden">
            <CopyLinkButton className={creamClass("sm")} />
            {pdfHref && !nothing ? <PdfLink href={pdfHref} kind={view.kind} className={outlineClass()} /> : null}
          </div>
        </div>
        {showRankbyai ? (
          <div className="flex flex-col items-start gap-4 rounded-[22px] border border-lp-border-2 bg-[linear-gradient(180deg,#121212,#0a0a0a)] p-[clamp(22px,3vw,32px)]">
            <span className="font-mono text-[12px] tracking-[0.1em] text-dim uppercase">{free ? "The full report" : "If you run an agency"}</span>
            <h3 className="m-0 text-[clamp(22px,2.4vw,28px)] leading-[1.1] font-semibold tracking-[-0.03em]">
              {free ? "This was one point. See the whole map." : "Make reports like this for every prospect"}
            </h3>
            <p className="m-0 text-[16px] leading-[1.6] text-lp-muted">
              {free
                ? "RankbyAI checks a grid of points around a business on ChatGPT, Perplexity, Gemini and Google Maps, audits its profile and website, and lists what to fix first."
                : "RankbyAI checks ChatGPT, Perplexity, Gemini and Google Maps on a grid around any local business, audits it, and builds this report, with your agency's name on it."}
            </p>
            <a href={site} className={cn(outlineClass(), "mt-auto print:hidden")}>
              <span>See how RankbyAI works</span><span aria-hidden>→</span>
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function MethodItem({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <dt className="font-mono text-[12px] tracking-[0.1em] text-dim uppercase">{term}</dt>
      <dd className="m-0 text-[15px] leading-[1.6] text-lp-muted">{children}</dd>
    </div>
  );
}

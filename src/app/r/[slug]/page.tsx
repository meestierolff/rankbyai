import type { Metadata } from "next";
import { io } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AiDisclaimer, PriorityBadge, ScoreRing, ctaClass, type Priority } from "@/components/brand/primitives";
import { DotGrid } from "@/components/brand/grid";
import { Logo } from "@/components/brand/logo";
import { NOT_AFFILIATED } from "@/lib/copy";
import { isDatabaseConfigured } from "@/lib/db/clients";
import { getReportView, type ReportView } from "@/lib/reports";
import { ReportViewed } from "./viewed";

// Share links are unguessable and never indexed.
export const metadata: Metadata = { title: "Report", robots: { index: false, follow: false, nocache: true } };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });

// A blocking route on purpose: the lookup must finish before any byte is sent, so an unknown or
// revoked link gets a real HTTP 404 (a streamed shell would already have answered 200).
export const instant = false;

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  await io();
  const { slug } = await params;
  if (!isDatabaseConfigured()) notFound();
  const view = await getReportView(slug);
  if (!view) notFound();
  return <ReportBody view={view} />;
}

function ReportBody({ view }: { view: ReportView }) {
  const { business, brand, ai, maps, audit } = view;
  const accent = brand.color ?? "var(--rb-fg)";
  const agency = brand.name;
  const free = view.kind === "free_check";
  const where = [business.city, business.region].filter(Boolean).join(", ");
  const enginesAvailable = ai?.single?.filter((s) => s.available) ?? [];
  const enginesNaming = enginesAvailable.filter((s) => s.mentioned);

  return (
    <div className="min-h-dvh">
      <ReportViewed kind={view.kind} />
      <header className="border-b border-line">
        <div className="container-page flex flex-wrap items-center justify-between gap-4 py-[14px]">
          <div className="flex items-center gap-3">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={agency ?? "Agency logo"} className="h-[34px] w-auto" />
            ) : agency ? null : (
              <Logo height={30} />
            )}
            <span className="text-[17px] font-semibold">{agency ?? <>rankbyai<span className="text-dim">.live</span></>}</span>
          </div>
          <span className="font-mono text-[12px] text-dim">
            {brand.hideRankbyai ? `Data: Google Maps + AI assistants, ${day(view.updatedAt)}` : `Verified by RankbyAI · ${day(view.updatedAt)}`}
          </span>
        </div>
      </header>

      <main className="container-page flex flex-col gap-8 py-[clamp(32px,5vw,64px)]">
        <div className="flex flex-col gap-3">
          <span className="text-eyebrow text-muted-foreground">{free ? "Free AI visibility check" : view.kind === "prospect" ? "AI visibility report" : "Live AI visibility report"}</span>
          <h1 className="m-0 text-[clamp(32px,4.4vw,56px)] leading-[1.05] font-semibold tracking-[-0.04em] text-balance">{business.name}</h1>
          <p className="m-0 text-[17px] text-muted-foreground">{[business.category, where].filter(Boolean).join(" · ")}</p>
          {view.opener ? <p className="m-0 mt-2 max-w-[820px] border-l-2 py-1 pl-4 text-[19px] leading-snug font-medium" style={{ borderColor: accent }}>{view.opener}</p> : null}
        </div>

        {view.watermark ? (
          <div role="note" className="rounded-xl border border-border-strong bg-surface-2 px-4 py-3 text-[14px] text-muted-foreground">
            This is a free single-point check. The full product checks every point of a map grid, keeps history and audits the business.
          </div>
        ) : null}

        {ai?.single ? (
          <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-[clamp(18px,3vw,32px)]" aria-label="AI answers">
            <h2 className="m-0 text-[clamp(22px,2.6vw,30px)] leading-tight font-semibold tracking-[-0.02em]">
              {enginesAvailable.length === 0
                ? "The AI assistants could not be reached for this check."
                : `Named by ${enginesNaming.length} of ${enginesAvailable.length} AI ${enginesAvailable.length === 1 ? "assistant" : "assistants"}.`}
            </h2>
            <p className="m-0 text-[15px] text-muted-foreground">
              Asked at the business location on {day(ai.date)}: “Who are the best {ai.service} near me?”
              {enginesNaming.length < enginesAvailable.length ? " These businesses were named instead:" : ""}
            </p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
              {ai.single.map((s) => (
                <div key={s.engine} className="flex flex-col gap-2 rounded-xl border border-border bg-inset p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-semibold">{s.engine}</span>
                    <span className={`font-mono text-[12px] ${!s.available ? "text-dim" : s.mentioned ? "text-g1" : "text-muted-foreground"}`}>
                      {!s.available ? "unavailable" : s.mentioned ? (s.position ? `named #${s.position}` : "named") : "not named"}
                    </span>
                  </div>
                  <ol className="m-0 flex list-none flex-col gap-[2px] p-0">
                    {s.names.map((n, i) => (
                      <li key={n.name} className={`flex gap-[10px] rounded-[7px] px-2 py-[5px] text-[14px] ${n.you ? "bg-you-tint text-g1" : ""}`}>
                        <span className="font-mono text-[12px] text-dim">{i + 1}</span>{n.name}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
            <AiDisclaimer />
          </section>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {ai && !ai.single ? (
            <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-[clamp(18px,3vw,28px)]" aria-label="AI grid">
              <div className="flex flex-col gap-1">
                <h2 className="m-0 text-[20px] font-semibold">AI assistants: named at {ai.pointsMentioned} of {ai.n * ai.n} points</h2>
                <span className="text-[14px] text-dim">“best {ai.service} near me” · {ai.n}×{ai.n} grid · {day(ai.date)}</span>
              </div>
              <DotGrid n={ai.n} cells={ai.cells} fontPx={ai.n >= 5 ? 12 : 14} gapPx={8} className="mx-auto w-full max-w-[440px]" />
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0 text-[13px]">
                {ai.engines.map((e) => (
                  <li key={e.key} className="rounded-full border border-border-strong px-3 py-1 text-muted-foreground">
                    {e.label}: {e.available ? `${e.mentioned}/${e.done}` : "unavailable"}
                  </li>
                ))}
              </ul>
              {ai.namedInstead.length ? (
                <p className="m-0 text-[14px] leading-normal text-muted-foreground">
                  <span className="text-fg">Named most often instead:</span> {ai.namedInstead.slice(0, 4).map((c) => c.name).join(", ")}.
                </p>
              ) : null}
              <AiDisclaimer />
            </section>
          ) : null}

          {maps ? (
            <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-[clamp(18px,3vw,28px)]" aria-label="Google Maps rank">
              {maps.single ? (
                <>
                  <div className="flex flex-col gap-1">
                    <h2 className="m-0 text-[20px] font-semibold">Google Maps: {maps.single.rank ? `rank #${maps.single.rank}` : "not in the top 20"} at the business location</h2>
                    <span className="text-[14px] text-dim">Keyword “{maps.keyword}” · {day(maps.date)}</span>
                  </div>
                  <ol className="m-0 flex list-none flex-col gap-[2px] p-0">
                    {maps.single.top.map((t) => (
                      <li key={t.rank} className={`flex gap-[10px] rounded-[7px] px-2 py-[5px] text-[14px] ${t.rank === maps.single!.rank ? "bg-you-tint text-g1" : ""}`}>
                        <span className="font-mono text-[12px] text-dim">{t.rank}</span>{t.name}
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <h2 className="m-0 text-[20px] font-semibold">Google Maps: top 3 at {maps.top3Points} of {maps.pointsDone} points</h2>
                    <span className="text-[14px] text-dim">“{maps.keyword}” · {maps.n}×{maps.n} grid · average rank {maps.avgRank ?? "—"} · {day(maps.date)}</span>
                  </div>
                  <DotGrid n={maps.n} cells={maps.cells} fontPx={maps.n >= 9 ? 9 : 11} gapPx={maps.n >= 9 ? 3 : 5} className="mx-auto w-full max-w-[440px]" />
                </>
              )}
            </section>
          ) : null}
        </div>

        {audit ? (
          <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-[clamp(18px,3vw,28px)]" aria-label="Audit">
            <div className="flex flex-wrap items-center gap-5">
              <ScoreRing score={audit.score} size={96} />
              <div className="flex flex-col gap-1">
                <h2 className="m-0 text-[20px] font-semibold">Local AI Audit: {audit.score}/100</h2>
                <span className="text-[14px] text-dim">Top fixes, highest impact first · {day(audit.date)}</span>
              </div>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {audit.findings.map((f) => (
                <li key={f.title} className="flex items-start gap-3 rounded-xl border border-border bg-inset px-4 py-3">
                  <PriorityBadge priority={f.priority as Priority} className="mt-[2px]" />
                  <span className="flex flex-col gap-1"><span className="text-[15px]">{f.title}</span><span className="text-[14px] text-dim">{f.fix}</span></span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!ai && !maps && !audit ? <p className="m-0 text-[16px] text-muted-foreground">This report has no completed scans yet. Check back soon.</p> : null}

        <section className="flex flex-col items-start gap-4 rounded-2xl border border-border-strong bg-surface-2 p-[clamp(18px,3vw,32px)]">
          {agency && brand.website ? (
            <>
              <h2 className="m-0 text-[24px] font-semibold tracking-[-0.02em]">Get this fixed by {agency}</h2>
              <a href={brand.website} rel="noopener noreferrer" className={ctaClass("md")} style={brand.color ? { background: brand.color, color: "#0b0b0b" } : undefined}>
                <span>Visit {agency}</span><span aria-hidden>→</span>
              </a>
            </>
          ) : free ? (
            <>
              <h2 className="m-0 text-[24px] font-semibold tracking-[-0.02em]">This was one point. See the whole map.</h2>
              <p className="m-0 max-w-[640px] text-[15px] leading-normal text-muted-foreground">
                RankbyAI checks every point of a grid around the business, on three AI engines and Google Maps, keeps history and tells you what to fix first. Pay once; scans run on your own API keys at cost.
              </p>
              <Link href="/#pricing" className={ctaClass("md")}><span>See lifetime pricing</span><span aria-hidden>→</span></Link>
            </>
          ) : (
            <p className="m-0 text-[15px] text-muted-foreground">This link always shows the latest scans for this business.</p>
          )}
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="container-page py-8 text-[13px] leading-normal text-dim">
          Results come from official APIs at fixed map points and dates. {brand.hideRankbyai ? "" : `Report by RankbyAI. ${NOT_AFFILIATED}`}
        </div>
      </footer>
    </div>
  );
}

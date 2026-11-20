import Link from "next/link";
import { notFound } from "next/navigation";
import { AiDisclaimer, PriorityBadge, SampleTag, ScoreRing, scoreColor, type Priority } from "@/components/brand/primitives";
import { FixKitMock } from "@/components/marketing/feature-mocks";
import { CATEGORY_LABEL, CATEGORY_WEIGHTS, type Category, type CheckResult } from "@/lib/audit/checks";
import type { StoredAuditInputs } from "@/lib/audit/run";
import type { SessionContext } from "@/lib/auth";
import { memberRead } from "@/lib/db/member-read";
import { userRead } from "./reads";
import { isMockMode } from "@/lib/mock";
import { getCreditBalance, getKeyStatuses } from "@/lib/workspace-data";
import { AuditForm, AuditProgress, CopyAuditPrompt, FixKitPanel, PagePlanEditor, ReviewKit, ReviewMath, type KitView } from "./audit-client";
import { auditFixPrompt, PLAYBOOK } from "@/lib/audit/prompt";
import { languageName, languageNameFor } from "@/lib/countries";
import { EmptyState, ErrorState, PageHeader, Panel, PrimaryLink, SecondaryLink, StatusChip, fmtUsd } from "./ui";
import { LocalTime } from "./local-time";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

interface AuditListRow { id: string; business_id: string; status: string; score: number | null; checks_ran: number; checks_total: number; funding: string; created_at: string; inputs: { service?: string }; businesses: { name: string } | { name: string }[] | null }

export async function AuditIndexPage({ ctx, businessId }: { ctx: SessionContext; businessId?: string }) {
  const ws = ctx.workspace;
  // memberRead falls back to a server read for this workspace when the gateway drops the signed-in identity.
  // The business list feeds the form: a failure there throws (error page) rather than showing no businesses.
  const [{ data: bizRows }, keyRows, credits, { data: auditRows, error }] = await Promise.all([
    memberRead<{ id: string; name: string; city: string | null; primary_category: string | null }[]>("Businesses", ws.id, (db) =>
      db.from("businesses").select("id, name, city, primary_category").eq("workspace_id", ws.id).neq("source", "prospect").order("created_at", { ascending: false }).limit(500),
    ),
    getKeyStatuses(ws.id),
    getCreditBalance(ws.id),
    memberRead<unknown[]>("Audits", ws.id, (db) =>
      db.from("audits").select("id, business_id, status, score, checks_ran, checks_total, funding, created_at, inputs, businesses(name)").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(50),
    ).then((r) => ({ data: r.data, error: null }), (e: unknown) => ({ data: null, error: e })),
  ]);
  const businesses = ((bizRows ?? []) as { id: string; name: string; city: string | null; primary_category: string | null }[]).map((b) => ({ id: b.id, name: b.name, city: b.city, category: b.primary_category }));
  const audits = (auditRows ?? []) as unknown as AuditListRow[];
  const locked = ws.plan !== "lifetime";
  const hasDataForSeo = isMockMode() || keyRows.some((k) => k.provider === "dataforseo" && k.status === "valid");

  return (
    <>
      <PageHeader title="Local AI Audit" description="A 0–100 score with findings ranked P0 to P3. Every finding shows the evidence it rests on, and checks that could not run are listed, never guessed." />
      {locked ? (
        <div className="mb-6 flex flex-col gap-3">
          <span className="flex items-center gap-2 text-[13px] text-dim"><SampleTag /> A preview of this screen with fictional data. Real audits need lifetime access.</span>
          <div className="overflow-hidden rounded-2xl border border-border bg-bg-alt p-[clamp(12px,2vw,24px)] pb-0"><FixKitMock /></div>
        </div>
      ) : null}

      {businesses.length === 0 ? (
        <EmptyState title="Add a business first" body="An audit compares one business with the competitors around it. Add the business, then come back here." action={<PrimaryLink href="/app/businesses">Add a business</PrimaryLink>} />
      ) : (
        <Panel title="Run an audit" className="mb-6">
          <AuditForm businesses={businesses} credits={credits} locked={locked} hasDataForSeo={hasDataForSeo} defaultBusinessId={businessId} />
        </Panel>
      )}

      <Panel title="Audits">
        {error ? <ErrorState body="The audits could not be loaded. Reload the page." /> : audits.length === 0 ? (
          <p className="m-0 text-[15px] text-muted-foreground">No audits yet. The first one takes about two minutes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
              <thead><tr className="text-[13px] text-dim">{["Business", "Service", "Score", "Checks ran", "Status", "Date"].map((h) => <th key={h} scope="col" className="border-b border-line px-3 py-2 font-medium first:pl-0">{h}</th>)}</tr></thead>
              <tbody>
                {audits.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-3 pl-0"><Link href={`/app/audit/${a.id}`} className="font-medium text-fg no-underline hover:underline">{one(a.businesses)?.name ?? "Business"}</Link></td>
                    <td className="px-3 py-3 text-muted-foreground">{a.inputs?.service ?? "—"}</td>
                    <td className="px-3 py-3 font-mono" style={a.score != null ? { color: scoreColor(a.score) } : undefined}>{a.score ?? "—"}</td>
                    <td className="px-3 py-3 font-mono text-muted-foreground">{a.status === "done" ? `${a.checks_ran} of ${a.checks_total}` : "—"}</td>
                    <td className="px-3 py-3"><StatusChip tone={a.status === "done" ? "good" : a.status === "failed" ? "bad" : "warn"}>{a.status}</StatusChip></td>
                    <td className="px-3 py-3 text-muted-foreground"><LocalTime iso={a.created_at} mode="date" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

// ───────────────────────── result ─────────────────────────

interface FindingRow { id: string; priority: Priority; category: string; title: string; evidence: { label: string; value: string; source_url?: string }[]; fix: string; impact_note: string | null; check_key: string; data: Record<string, unknown> }

const safeUrl = (u: string | undefined) => (u && /^https?:\/\//i.test(u) ? u : null);
/** Captions under each priority: the same playbook the copied prompt and the MCP prompt use. */
const PRIORITY_NOTE = (p: Priority) => PLAYBOOK[p][0].toUpperCase() + PLAYBOOK[p].slice(1);

function Finding({ f }: { f: FindingRow }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-inset p-4">
      <div className="flex items-start gap-3">
        <PriorityBadge priority={f.priority} className="mt-[2px] shrink-0" />
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="m-0 text-[16px] leading-snug font-semibold">{f.title}</h3>
          <span className="text-[13px] text-dim">{CATEGORY_LABEL[f.category as Category] ?? f.category}</span>
        </div>
      </div>
      <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-1 text-[14px] sm:grid-cols-[minmax(160px,auto)_1fr]">
        {f.evidence.map((e, i) => {
          const url = safeUrl(e.source_url);
          return (
            <div key={i} className="contents">
              <dt className="text-muted-foreground">{e.label}</dt>
              <dd className="m-0 break-words text-fg-2">
                {e.value}
                {url ? <> <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="text-dim underline underline-offset-2 hover:text-fg">source</a></> : null}
              </dd>
            </div>
          );
        })}
      </dl>
      {f.fix ? <p className="m-0 text-[14px] leading-normal"><span className="font-semibold">How to fix: </span>{f.fix}</p> : null}
      {f.impact_note ? <p className="m-0 text-[13px] leading-normal text-dim">{f.impact_note}</p> : null}
    </li>
  );
}

interface AuditDetailRow {
  id: string; business_id: string; status: string; score: number | null; category_scores: unknown; checks_ran: number; checks_total: number;
  inputs: unknown; funding: string; est_cost_usd: number | null; cost_usd: number | null; error: string | null; created_at: string; finished_at: string | null; businesses: unknown;
}

export async function AuditDetailPage({ ctx, auditId }: { ctx: SessionContext; auditId: string }) {
  if (!/^[0-9a-f-]{36}$/.test(auditId)) notFound();
  // A failed read raises an error page; only an audit that really is not there is a 404.
  const { data: audit } = await memberRead<AuditDetailRow>("Audit", ctx.workspace.id, (db) =>
    db
      .from("audits")
      .select("id, business_id, status, score, category_scores, checks_ran, checks_total, inputs, funding, est_cost_usd, cost_usd, error, created_at, finished_at, businesses(id, name, city, website, primary_category, language, country, place_id)")
      .eq("id", auditId).eq("workspace_id", ctx.workspace.id).maybeSingle(),
  );
  if (!audit) notFound();
  type AuditBusiness = { id: string; name: string; city: string | null; website: string | null; primary_category: string | null; language: string | null; country: string | null; place_id: string | null };
  const business = one(audit.businesses as unknown as AuditBusiness | AuditBusiness[]);
  const header = (
    <PageHeader
      title={business?.name ?? "Audit"}
      description={<Link href="/app/audit" className="text-muted-foreground no-underline hover:text-fg">← Local AI Audit</Link>}
      actions={
        <>
          {business ? <SecondaryLink href={`/app/businesses/${business.id}`}>Business page</SecondaryLink> : null}
          <PrimaryLink href={`/app/audit?business=${audit.business_id}`}>Run again</PrimaryLink>
        </>
      }
    />
  );

  if (audit.status === "queued" || audit.status === "running") return <>{header}<AuditProgress auditId={audit.id} /></>;
  if (audit.status === "failed") return <>{header}<ErrorState title="The audit did not finish" body={audit.error ?? "Nothing was charged for it. Run it again."} /></>;

  const inputs = audit.inputs as StoredAuditInputs;
  const ws = ctx.workspace.id;
  // Findings have no workspace column, so they are read signed in only; a failed read throws (error page,
  // never an audit that looks empty). The other two filter by workspace and may fall back to a server read.
  const [findingRows, { data: previousRows }, { data: kitRows }] = await Promise.all([
    userRead("Audit findings", (db) => db.from("audit_findings").select("id, priority, category, title, evidence, fix, impact_note, check_key, data").eq("audit_id", audit.id)),
    memberRead<unknown[]>("Previous audit", ws, (db) =>
      db.from("audits").select("id, score, created_at, checks_total, inputs->checks").eq("workspace_id", ws).eq("business_id", audit.business_id).eq("status", "done").lt("created_at", audit.created_at).order("created_at", { ascending: false }).limit(1),
    ),
    memberRead<unknown[]>("Fix kit", ws, (db) =>
      db.from("fix_kits").select("id, description, faqs, jsonld_localbusiness, jsonld_faq, llms_txt, checklist").eq("workspace_id", ws).eq("audit_id", audit.id).order("created_at", { ascending: false }).limit(1),
    ),
  ]);
  const findings = ((findingRows ?? []) as FindingRow[]).sort((a, b) => a.priority.localeCompare(b.priority));
  const previous = ((previousRows ?? []) as { id: string; score: number | null; created_at: string; checks_total: number; checks: { key: string }[] | null }[])[0];
  const kit = ((kitRows ?? []) as KitView[])[0] ?? null;
  const scores = audit.category_scores as Record<Category, { score: number | null; ran: number; total: number }>;
  const score = audit.score ?? 0;
  // Scores are comparable only when both audits ran the same checks: when checks were added since,
  // a lower score can mean "more was checked", not "the business got worse".
  const sameChecks = !!previous && (previous.checks ?? []).map((c) => c.key).sort().join() === (inputs.checks ?? []).map((c: CheckResult) => c.key).sort().join();
  const delta = previous?.score != null && sameChecks ? score - previous.score : null;
  const ranPct = audit.checks_total ? Math.round((audit.checks_ran / audit.checks_total) * 100) : 0;
  const checks = inputs.checks ?? [];
  const passed = checks.filter((c: CheckResult) => c.status === "pass");
  const skipped = checks.filter((c: CheckResult) => c.status === "not_checked");
  const locked = ctx.workspace.plan !== "lifetime";
  // The whole audit as one prompt for an AI assistant, findings in playbook order (lib/audit/prompt).
  const aiPrompt = business
    ? auditFixPrompt({
        business: { name: business.name, city: business.city, website: business.website, category: business.primary_category },
        language: languageName(business.language) ?? languageNameFor(business.country),
        service: inputs.service ?? null, score: audit.score, findings,
      })
    : null;
  const rivalsWithReviews = inputs.competitors.filter((c): c is typeof c & { reviews: number } => c.reviews != null).map((c) => ({ name: c.name, reviews: c.reviews }));

  return (
    <>
      {header}
      <div className="flex flex-col gap-6">
        {/* Summary before detail: the score, how it moved, and how much of the audit could run. */}
        <Panel>
          <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
            <div className="flex items-center gap-5">
              <ScoreRing score={score} size={132} />
              <div className="flex flex-col gap-1">
                <span className="text-[13px] tracking-[0.05em] text-dim uppercase">Local AI Audit score</span>
                {delta != null ? (
                  <span className="font-mono text-[15px]" style={{ color: delta > 0 ? "var(--rb-g1)" : delta < 0 ? "var(--rb-orange)" : undefined }}>
                    {delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${Math.abs(delta)}` : "No change"} <span className="text-dim">since <LocalTime iso={previous!.created_at} mode="date" /></span>
                  </span>
                ) : previous ? (
                  <span className="text-[14px] text-dim">Not comparable with <LocalTime iso={previous.created_at} mode="date" />: new checks were added since</span>
                ) : <span className="text-[14px] text-dim">First audit of this business</span>}
                <span className="text-[14px] text-muted-foreground">{ranPct}% of checks ran ({audit.checks_ran} of {audit.checks_total})</span>
                <span className="text-[13px] text-dim">Service: {inputs.service} · <LocalTime iso={audit.finished_at ?? audit.created_at} /></span>
              </div>
            </div>
            <ul className="m-0 grid min-w-[280px] flex-1 list-none grid-cols-1 gap-x-8 gap-y-3 p-0 sm:grid-cols-2">
              {(Object.keys(CATEGORY_WEIGHTS) as Category[]).map((cat) => {
                const s = scores[cat];
                return (
                  <li key={cat} className="flex flex-col gap-[6px]">
                    <div className="flex items-baseline justify-between gap-3 text-[14px]">
                      <span>{CATEGORY_LABEL[cat]} <span className="text-dim">· weight {CATEGORY_WEIGHTS[cat]}</span></span>
                      <span className="font-mono">{s?.score == null ? "not checked" : s.score}</span>
                    </div>
                    <div className="h-[6px] overflow-hidden rounded-full bg-border" role="img" aria-label={s?.score == null ? `${CATEGORY_LABEL[cat]}: not checked` : `${CATEGORY_LABEL[cat]}: ${s.score} of 100`}>
                      {s?.score != null ? <div className="h-full rounded-full" style={{ width: `${s.score}%`, background: scoreColor(s.score) }} /> : null}
                    </div>
                    <span className="text-[12px] text-dim">{s ? `${s.ran} of ${s.total} checks ran` : ""}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="mt-5 mb-0 text-[13px] leading-normal text-dim">
            The score is the weighted share of checks that passed, counting only checks that could run. It describes what we could read on <LocalTime iso={audit.created_at} mode="date" />; it is not a ranking prediction.
            {inputs.mock ? " This audit ran on simulated vendor data (development mode)." : ""}
          </p>
        </Panel>

        <Panel title={`Findings (${findings.length})`} action={aiPrompt ? <CopyAuditPrompt prompt={aiPrompt} /> : undefined}>
          {findings.length === 0 ? <p className="m-0 text-[15px] text-muted-foreground">Every check that could run passed.</p> : (
            <div className="flex flex-col gap-6">
              {(["P0", "P1", "P2", "P3"] as Priority[]).filter((p) => findings.some((f) => f.priority === p)).map((p) => (
                <section key={p} className="flex flex-col gap-3" aria-label={`${p} findings`}>
                  <div className="flex items-center gap-2 text-[13px] text-dim"><PriorityBadge priority={p} /> {PRIORITY_NOTE(p)}</div>
                  <ul className="m-0 flex list-none flex-col gap-3 p-0">{findings.filter((f) => f.priority === p).map((f) => <Finding key={f.id} f={f} />)}</ul>
                </section>
              ))}
            </div>
          )}
        </Panel>

        {inputs.competitors.length ? (
          <Panel title="You and the map pack">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
                <thead><tr className="text-[13px] text-dim">{["Business", "Primary category", "Reviews", "Rating", "Website"].map((h) => <th key={h} scope="col" className="border-b border-line px-3 py-2 font-medium first:pl-0">{h}</th>)}</tr></thead>
                <tbody>
                  {[{ name: `${business?.name ?? "You"} (you)`, category: inputs.profile?.category ?? null, reviews: inputs.profile?.reviews ?? null, rating: inputs.profile?.rating ?? null, website: inputs.site?.url ?? null, you: true }, ...inputs.competitors.map((c) => ({ ...c, you: false }))].map((r) => {
                    const url = safeUrl(r.website ?? undefined);
                    return (
                      <tr key={r.name} className={`border-b border-line last:border-0 ${r.you ? "bg-inset" : ""}`}>
                        <td className="px-3 py-3 pl-0 font-medium">{r.name}</td>
                        <td className="px-3 py-3 text-muted-foreground">{r.category ?? "not returned"}</td>
                        <td className="px-3 py-3 font-mono">{r.reviews ?? "—"}</td>
                        <td className="px-3 py-3 font-mono">{r.rating != null ? r.rating.toFixed(1) : "—"}</td>
                        <td className="px-3 py-3">{url ? <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="text-muted-foreground underline underline-offset-2 hover:text-fg">{new URL(url).hostname.replace(/^www\./, "")}</a> : <span className="text-dim">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 mb-0 text-[13px] text-dim">Competitors are the businesses that hold the top three Google Maps places most often around this business{inputs.mapsKeyword ? ` for “${inputs.mapsKeyword}”` : " in its latest Maps grid"}. Figures are from their Google profiles on <LocalTime iso={audit.created_at} mode="date" />.</p>
          </Panel>
        ) : null}

        {inputs.profile?.reviews != null && rivalsWithReviews.length ? (
          <Panel title="Review maths">
            <ReviewMath you={inputs.profile.reviews} competitors={rivalsWithReviews} initialMonths={inputs.months} />
          </Panel>
        ) : null}

        {business?.place_id ? (
          <Panel title="Ask for reviews">
            <ReviewKit name={business.name} placeId={business.place_id} />
          </Panel>
        ) : null}

        {inputs.pagePlan ? (
          <Panel title="Page plan: services × areas">
            <PagePlanEditor auditId={audit.id} initial={inputs.pagePlan} canEdit={!locked} />
          </Panel>
        ) : null}

        <Panel title="Fix Kit">
          <FixKitPanel auditId={audit.id} initial={kit} locked={locked} canRegenerate={audit.funding === "byok" || (!!kit && !kit.description)} />
        </Panel>

        <Panel title={`Checks that passed (${passed.length})`}>
          {passed.length === 0 ? <p className="m-0 text-[15px] text-muted-foreground">None.</p> : (
            <ul className="m-0 grid list-none grid-cols-1 gap-x-8 gap-y-2 p-0 text-[14px] sm:grid-cols-2">
              {passed.map((c) => <li key={c.key} className="flex gap-2"><span aria-hidden className="text-g1">✓</span><span className="text-fg-2">{c.title}</span></li>)}
            </ul>
          )}
        </Panel>

        {skipped.length ? (
          <Panel title={`Not checked (${skipped.length})`}>
            <p className="mt-0 mb-3 text-[14px] text-muted-foreground">These checks could not run, so they are left out of the score. Nothing was assumed.</p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
              {skipped.map((c) => <li key={c.key} className="flex flex-col"><span className="text-fg-2">{c.title}</span><span className="text-[13px] text-dim">{c.reason}</span></li>)}
            </ul>
          </Panel>
        ) : null}

        <div className="flex flex-col gap-2 text-[13px] text-dim">
          <span>
            {audit.funding === "byok" ? `Cost on your keys: ${fmtUsd(Number(audit.cost_usd ?? 0), 3)} (estimate ${fmtUsd(Number(audit.est_cost_usd ?? 0), 3)}).` : "Paid with 1 included scan."}
            {inputs.site ? ` Website pages read: ${inputs.site.pagesRead}.` : " The website could not be read."}
            {inputs.serviceMethod ? ` Services read ${inputs.serviceMethod === "llm" ? "with an OpenAI call" : "from page addresses and navigation"}.` : ""}
          </span>
          {inputs.ai ? <AiDisclaimer /> : null}
        </div>
      </div>
    </>
  );
}

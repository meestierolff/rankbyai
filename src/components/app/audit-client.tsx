"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ctaClass, secondaryClass } from "@/components/brand/primitives";
import { Segmented } from "@/components/brand/segmented";
import { pageMath, reviewTarget } from "@/lib/audit/math";
import { track } from "@/lib/analytics";
import QRCode from "qrcode";
import { googleReviewLink, mapsPlaceUrl, REVIEW_ASK, REVIEW_RULES } from "@/lib/reviews";
import { inputClass, labelClass } from "./ui";
import { CREDIT_COST } from "@/lib/pricing-constants";
import { plural } from "./first-run";

const money = (v: number) => "$" + (v < 1 ? v.toFixed(3) : v.toFixed(2));
const post = (url: string, body: unknown, method = "POST") => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ───────────────────────── start an audit ─────────────────────────

interface Estimate { totalUsd: number; credits: number; lines: { label: string; usd: number }[]; runsMapsCheck: boolean; runsAiCheck: boolean }

export function AuditForm({ businesses, credits, locked, hasDataForSeo, defaultBusinessId }: {
  businesses: { id: string; name: string; city: string | null; category: string | null }[];
  credits: number;
  locked: boolean;
  hasDataForSeo: boolean;
  defaultBusinessId?: string;
}) {
  const router = useRouter();
  const first = businesses.find((b) => b.id === defaultBusinessId) ?? businesses[0];
  const [businessId, setBusinessId] = useState(first?.id ?? "");
  const [service, setService] = useState(first?.category ? first.category.toLowerCase() : "");
  const [months, setMonths] = useState(3);
  const [funding, setFunding] = useState<"byok" | "credits">(hasDataForSeo ? "byok" : "credits");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const ready = !!businessId && service.trim().length >= 2;

  useEffect(() => {
    if (!businessId || service.trim().length < 2) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      const res = await post("/api/audits", { business_id: businessId, service, months, funding, confirm: false });
      const json = (await res.json().catch(() => ({}))) as { estimate?: Estimate; error?: string; message?: string };
      if (my !== seq.current) return;
      setEstimate(json.estimate ?? null);
      setProblem(json.error === "confirmation_required" ? null : (json.message ?? "Could not estimate this audit."));
    }, 350);
    return () => clearTimeout(t);
  }, [businessId, service, months, funding]);

  const run = async () => {
    setBusy(true);
    setProblem(null);
    const res = await post("/api/audits", { business_id: businessId, service, months, funding, confirm: true });
    const json = (await res.json().catch(() => ({}))) as { audit_id?: string; message?: string };
    if (res.ok && json.audit_id) return router.push(`/app/audit/${json.audit_id}`);
    setBusy(false);
    setProblem(json.message ?? "The audit could not start. Nothing was charged.");
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Business</span>
          <select
            value={businessId}
            onChange={(e) => {
              setBusinessId(e.target.value);
              const b = businesses.find((x) => x.id === e.target.value);
              if (b?.category) setService(b.category.toLowerCase());
            }}
            className={inputClass}
          >
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}{b.city ? ` · ${b.city}` : ""}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Main service</span>
          <input value={service} onChange={(e) => setService(e.target.value)} maxLength={80} placeholder="dentist" className={inputClass} />
          <span className="text-[13px] text-dim">What customers search for. Used to find the competitors on Google Maps and to check the homepage title.</span>
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Months to close the review gap</span>
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={`${inputClass} max-w-[160px]`}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m} {m === 1 ? "month" : "months"}</option>)}
          </select>
          <span className="text-[13px] text-dim">Sets the monthly review target. You can change it on the result as well.</span>
        </label>
        <div className="flex flex-col gap-[6px]">
          <span className={labelClass}>Paid with</span>
          <Segmented
            label="Funding" value={funding} onChange={setFunding}
            options={[{ value: "byok" as const, label: "My own keys" }, { value: "credits" as const, label: "Included scans" }]}
          />
          {funding === "credits" ? <span className="text-[13px] text-dim">An audit uses {plural(CREDIT_COST.audit, "credit")}. You have {credits} left.</span> : null}
          {funding === "byok" && !hasDataForSeo ? <span className="text-[13px] text-amber">The audit reads Google profile details through DataForSEO. Add that login in Settings → API keys, or use an included scan.</span> : null}
        </div>
      </div>

      <aside className="flex h-fit flex-col gap-4 rounded-2xl border border-border bg-inset p-5" aria-live="polite">
        <span className="text-[13px] tracking-[0.05em] text-dim uppercase">Estimate before you run</span>
        {estimate ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[40px] leading-none font-semibold tracking-[-0.03em]">{funding === "credits" ? estimate.credits : `≈ ${money(estimate.totalUsd)}`}</span>
              <span className="text-[15px] text-muted-foreground">{funding === "credits" ? "credit" : "on your keys"}</span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
              {estimate.lines.map((l) => (
                <li key={l.label} className="flex justify-between gap-3 text-muted-foreground"><span>{l.label}</span><span className="font-mono text-fg">{money(l.usd)}</span></li>
              ))}
            </ul>
            <p className="m-0 text-[13px] leading-normal text-dim">
              {funding === "credits" ? "Paid from your included scans. The API cost is ours." : "Estimate from published prices. Your vendors bill you; the actual cost is shown on the result."}
              {estimate.runsMapsCheck || estimate.runsAiCheck ? " No recent scan was found for this business, so the audit runs one small check itself." : " The audit reuses this business's latest scans."}
            </p>
          </>
        ) : <p className="m-0 text-[15px] text-muted-foreground">Pick a business and its main service to see the cost.</p>}
        {problem ? <p role="alert" className="m-0 text-[14px] text-danger">{problem}</p> : null}
        <button type="button" onClick={run} disabled={!ready || busy || locked || !estimate} className={ctaClass("block", "cursor-pointer border-0 text-[16px]")}>
          <span>{busy ? "Starting…" : locked ? "Needs lifetime access" : "Run audit"}</span><span aria-hidden>→</span>
        </button>
      </aside>
    </div>
  );
}

// ───────────────────────── while it runs ─────────────────────────

/** Polls until the audit finishes, then reloads the page so the server renders the result. */
export function AuditProgress({ auditId }: { auditId: string }) {
  const router = useRouter();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let stop = false;
    const started = Date.now();
    const tick = async () => {
      if (stop) return;
      const res = await fetch(`/api/audits/${auditId}`, { cache: "no-store" }).catch(() => null);
      const json = res?.ok ? ((await res.json().catch(() => null)) as { audit?: { status: string } } | null) : null;
      if (json?.audit && json.audit.status !== "queued" && json.audit.status !== "running") return router.refresh();
      if (Date.now() - started > 90_000) setSlow(true);
      setTimeout(tick, 3000);
    };
    const t = setTimeout(tick, 2000);
    return () => { stop = true; clearTimeout(t); };
  }, [auditId, router]);
  return (
    <div className="flex max-w-[640px] flex-col gap-4 rounded-2xl border border-border bg-surface p-6" aria-live="polite">
      <span className="text-[17px] font-semibold">Running the audit…</span>
      <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-[15px] leading-normal text-muted-foreground">
        <li>Finding who holds the map pack for this service</li>
        <li>Reading the Google profiles of the business and its top competitors</li>
        <li>Reading the website and the competitors&apos; service pages</li>
        <li>Checking what AI assistants answer at this location</li>
      </ol>
      <div className="h-[3px] w-full overflow-hidden rounded-full bg-border"><div className="h-full w-1/3 animate-pulse rounded-full bg-fg" /></div>
      <p className="m-0 text-[13px] text-dim">{slow ? "This is taking longer than usual: a slow website or vendor. You can leave this page; the result will be here when it is done." : "Usually under two minutes. You can leave this page; the result is saved."}</p>
    </div>
  );
}

// ───────────────────────── review maths ─────────────────────────

/** The same formula as the audit (lib/audit/math.ts), recalculated when the user changes the period. */
export function ReviewMath({ you, competitors, initialMonths }: { you: number; competitors: { name: string; reviews: number }[]; initialMonths: number }) {
  const [months, setMonths] = useState(initialMonths);
  const rt = reviewTarget(you, competitors.map((c) => c.reviews), months);
  if (!rt) return null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="flex flex-col gap-1"><span className="text-[13px] text-muted-foreground">Monthly target</span><span className="font-mono text-[36px] leading-none font-semibold">{rt.monthlyTarget}</span><span className="text-[13px] text-dim">new reviews a month</span></div>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[13px] text-muted-foreground">Over</span>
          <select aria-label="Months to close the review gap" value={months} onChange={(e) => setMonths(Number(e.target.value))} className={`${inputClass} w-[140px]`}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m} {m === 1 ? "month" : "months"}</option>)}
          </select>
        </label>
      </div>
      <p className="m-0 font-mono text-[14px] leading-relaxed text-fg-2">
        You {rt.you} · competitor median {rt.top3Median} · gap {rt.gap} · ÷ {rt.months} {rt.months === 1 ? "month" : "months"} = {rt.monthlyTarget} reviews/month
      </p>
      <p className="m-0 text-[13px] text-dim">
        Competitors compared: {competitors.map((c) => `${c.name} (${c.reviews})`).join(", ")}. Average {rt.top3Average}, highest {rt.top3Max}.{rt.gap === 0 ? " You are at or above the median: keep the pace." : ""}
      </p>
    </div>
  );
}

// ───────────────────────── page plan ─────────────────────────

const toLines = (s: string) => [...new Set(s.split("\n").map((x) => x.trim()).filter(Boolean))];

export function PagePlanEditor({ auditId, initial, canEdit }: { auditId: string; initial: { services: string[]; areas: string[]; radiusMiles: number; pagesHave: number }; canEdit: boolean }) {
  const [services, setServices] = useState(initial.services.join("\n"));
  const [areas, setAreas] = useState(initial.areas.join("\n"));
  const [saved, setSaved] = useState({ services: initial.services.join("\n"), areas: initial.areas.join("\n") });
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const s = toLines(services);
  const a = toLines(areas);
  const pm = pageMath(s, a, initial.pagesHave);
  const dirty = services !== saved.services || areas !== saved.areas;

  const save = async () => {
    setState("saving");
    setMessage(null);
    const res = await post(`/api/audits/${auditId}`, { services: s, areas: a }, "PATCH");
    if (res.ok) {
      setSaved({ services, areas });
      setState("idle");
      setMessage("Saved. The download now uses these lists.");
    } else {
      setState("error");
      setMessage(((await res.json().catch(() => ({}))) as { message?: string }).message ?? "The lists could not be saved.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 font-mono text-[15px] leading-relaxed text-fg">
        {pm.services} {pm.services === 1 ? "service" : "services"} × {pm.areas} {pm.areas === 1 ? "area" : "areas"} = {pm.pagesNeeded} pages; you have {pm.pagesHave} → {pm.toBuild} to build
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Services (one per line)</span>
          <textarea value={services} onChange={(e) => setServices(e.target.value)} rows={8} disabled={!canEdit} className={`${inputClass} font-mono text-[13px]`} />
          <span className="text-[13px] text-dim">Found on your site and on competitor sites. Remove what you do not offer.</span>
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Areas within {initial.radiusMiles} miles (one per line)</span>
          <textarea value={areas} onChange={(e) => setAreas(e.target.value)} rows={8} disabled={!canEdit} className={`${inputClass} font-mono text-[13px]`} />
          <span className="text-[13px] text-dim">Place names from OpenStreetMap. Remove areas you do not serve.</span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {canEdit ? <button type="button" onClick={save} disabled={!dirty || state === "saving"} className={secondaryClass("cursor-pointer disabled:opacity-50")}>{state === "saving" ? "Saving…" : "Save lists"}</button> : null}
        {dirty || pm.pagesNeeded === 0 ? (
          <span className="text-[13px] text-dim">{pm.pagesNeeded === 0 ? "Add at least one service and one area." : "Save the lists to download the updated plan."}</span>
        ) : (
          <a href={`/api/audits/${auditId}/pages.csv`} download onClick={() => track("csv_exported", { kind: "page_plan" })} className={secondaryClass("no-underline")}>Download page plan (CSV, {pm.pagesNeeded} rows)</a>
        )}
        {message ? <span role="status" className={`text-[13px] ${state === "error" ? "text-danger" : "text-g1"}`}>{message}</span> : null}
      </div>
    </div>
  );
}

// ───────────────────────── Fix Kit ─────────────────────────

export interface KitView {
  id: string;
  description: string | null;
  faqs: { question: string; answer: string }[];
  jsonld_localbusiness: Record<string, unknown> | null;
  jsonld_faq: Record<string, unknown> | null;
  llms_txt: string | null;
  checklist: { group: string; text: string; url?: string }[];
}

function CopyBlock({ section, title, hint, text, mono = true }: { section: string; title: string; hint: string; text: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      track("fixkit_copied", { section });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The text stays selectable when the clipboard is blocked.
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-inset p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col"><span className="text-[15px] font-semibold">{title}</span><span className="text-[13px] text-dim">{hint}</span></div>
        <button type="button" onClick={copy} className={secondaryClass("cursor-pointer py-[6px] text-[13px]")} aria-live="polite">{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre tabIndex={0} className={`m-0 max-h-[320px] overflow-auto rounded-lg bg-bg p-3 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2 ${mono ? "font-mono" : "font-sans"}`}>{text}</pre>
    </div>
  );
}

/** One SVG path for the dark modules of a QR code, drawn from the matrix (no innerHTML). */
function qrPath(text: string): { size: number; d: string } {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
  return { size: n + 4, d };
}

/**
 * Ask for reviews in person, inside Google's rules (lib/reviews): the link (the Maps page by
 * default, or the direct review link pasted from the profile), a QR code for a counter card, and
 * what to say. Everything happens in the browser; nothing is stored.
 */
export function ReviewKit({ name, placeId }: { name: string; placeId: string }) {
  const [pasted, setPasted] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const direct = pasted.trim() ? googleReviewLink(pasted) : null;
  const link = direct ?? mapsPlaceUrl(name, placeId);
  const qr = qrPath(link);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.size} ${qr.size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${qr.d}" fill="#000"/></svg>`;
  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      track("fixkit_copied", { section: `review_${what}` });
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Both texts are on the page to select by hand.
    }
  };
  return (
    <div className="flex flex-wrap gap-6">
      <div className="flex flex-col items-center gap-2">
        <svg viewBox={`0 0 ${qr.size} ${qr.size}`} width={168} height={168} shapeRendering="crispEdges" role="img" aria-label={`QR code for ${direct ? "the review link" : "the Google Maps page"}`} className="rounded-lg">
          <rect width="100%" height="100%" fill="#fff" />
          <path d={qr.d} fill="#000" />
        </svg>
        <a href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} download="review-qr.svg" className={secondaryClass("py-[6px] text-[13px] no-underline")}>Download QR (SVG)</a>
      </div>
      <div className="flex min-w-[260px] flex-1 flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Direct review link (optional)</span>
          <input value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="https://g.page/r/…/review" className={inputClass} inputMode="url" />
          <span className="text-[12.5px] leading-normal text-dim">
            {pasted.trim() && !direct
              ? "That is not a Google link. Paste the link from the profile, or leave this empty to use the Maps page."
              : direct
                ? "Using the direct link: it opens the review form."
                : "Without it, the code opens the business on Google Maps, one tap from “Write a review”. For a direct link: Google Business Profile → Read reviews → Get more reviews → Share → Copy."}
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <code className="max-w-full truncate rounded-md bg-bg px-2 py-1 font-mono text-[12px] text-fg-2">{link}</code>
          <button type="button" onClick={() => copy("link", link)} className={secondaryClass("cursor-pointer py-[6px] text-[13px]")} aria-live="polite">{copied === "link" ? "Copied" : "Copy link"}</button>
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelClass}>What to say, at the end of every visit</span>
          <p className="m-0 rounded-lg bg-bg px-3 py-2 text-[14px] leading-relaxed text-fg-2">{REVIEW_ASK}</p>
          <button type="button" onClick={() => copy("ask", REVIEW_ASK)} className={secondaryClass("w-fit cursor-pointer py-[6px] text-[13px]")} aria-live="polite">{copied === "ask" ? "Copied" : "Copy text"}</button>
        </div>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] leading-normal text-muted-foreground">
          {REVIEW_RULES.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>
    </div>
  );
}

/**
 * "Copy for ChatGPT / Claude": the whole audit as one prompt (lib/audit/prompt), findings in
 * priority order with the guardrails. Built on the server; this only copies it.
 */
export function CopyAuditPrompt({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setFailed(false);
      track("fix_prompt_copied", { surface: "audit" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={copy} className={secondaryClass("cursor-pointer py-[6px] text-[13px]")} title="The findings in priority order, with how to work and what not to do" aria-live="polite">
        {copied ? "Copied" : "Copy for ChatGPT / Claude"}
      </button>
      {failed ? (
        <label className="flex w-full max-w-[640px] flex-col gap-1 text-[12px] text-dim">
          <span role="alert">The browser blocked copying. Select the text below and copy it.</span>
          <textarea readOnly value={prompt} rows={8} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-lg border border-border bg-bg p-2 font-mono text-[12px] text-fg-2" />
        </label>
      ) : null}
    </div>
  );
}

const script = (ld: Record<string, unknown>) => `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>`;

export function FixKitPanel({ auditId, initial, locked, canRegenerate }: { auditId: string; initial: KitView | null; locked: boolean; canRegenerate: boolean }) {
  const [kit, setKit] = useState<KitView | null>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const generate = async (regenerate: boolean) => {
    setBusy(true);
    setProblem(null);
    const res = await post(`/api/audits/${auditId}/fix-kit`, { regenerate });
    const json = (await res.json().catch(() => ({}))) as { kit?: KitView; note?: string | null; message?: string };
    setBusy(false);
    if (res.ok && json.kit) {
      setKit(json.kit);
      setNote(json.note ?? null);
    } else setProblem(json.message ?? "The Fix Kit could not be generated.");
  };

  if (!kit) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="m-0 max-w-[640px] text-[15px] leading-normal text-muted-foreground">
          Copy-ready fixes built from this audit: a factual description, FAQs from the business&apos;s own pages, LocalBusiness and FAQPage schema, an llms.txt draft and a checklist. You paste them in; RankbyAI does not edit listings or websites.
        </p>
        {problem ? <p role="alert" className="m-0 text-[14px] text-danger">{problem}</p> : null}
        <button type="button" onClick={() => generate(false)} disabled={busy || locked} className={ctaClass("md", "cursor-pointer border-0")}>
          <span>{busy ? "Building…" : locked ? "Needs lifetime access" : "Build the Fix Kit"}</span><span aria-hidden>→</span>
        </button>
      </div>
    );
  }

  const groups = [...new Set(kit.checklist.map((c) => c.group))];
  return (
    <div className="flex flex-col gap-4">
      {note ? <p role="status" className="m-0 rounded-xl border border-amber/50 bg-inset p-3 text-[14px] text-fg-2">{note}</p> : null}
      {kit.description ? <CopyBlock section="description" title="Business description" hint={`${kit.description.length} of 750 characters. For the Google profile and the About page.`} text={kit.description} mono={false} /> : null}
      {kit.faqs.length ? <CopyBlock section="faqs" title={`${kit.faqs.length} FAQs`} hint="Written from the business's own pages. Read them before publishing." text={kit.faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")} mono={false} /> : null}
      {kit.jsonld_localbusiness ? <CopyBlock section="jsonld_localbusiness" title="LocalBusiness schema" hint="Paste into the <head> of the homepage. Add your opening hours before publishing." text={script(kit.jsonld_localbusiness)} /> : null}
      {kit.jsonld_faq ? <CopyBlock section="jsonld_faq" title="FAQPage schema" hint="Paste on the page that shows these FAQs. The questions must be visible on that page." text={script(kit.jsonld_faq)} /> : null}
      {kit.llms_txt ? <CopyBlock section="llms_txt" title="llms.txt draft" hint="Save as /llms.txt at the root of the website." text={kit.llms_txt} /> : null}
      {kit.checklist.length ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-inset p-4">
          <span className="text-[15px] font-semibold">Checklist</span>
          {groups.map((g) => (
            <div key={g} className="flex flex-col gap-2">
              <span className="text-[13px] tracking-[0.05em] text-dim uppercase">{g}</span>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {kit.checklist.filter((c) => c.group === g).map((c, i) => (
                  <li key={i} className="flex gap-2 text-[14px] leading-normal text-fg-2">
                    <span aria-hidden className="mt-[3px] size-[14px] shrink-0 rounded-[4px] border border-border-strong" />
                    <span>{c.text}{c.url ? <> <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="text-fg underline underline-offset-2">Open</a></> : null}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      {problem ? <p role="alert" className="m-0 text-[14px] text-danger">{problem}</p> : null}
      {canRegenerate ? (
        <button type="button" onClick={() => generate(true)} disabled={busy} className={secondaryClass("w-fit cursor-pointer disabled:opacity-50")}>{busy ? "Building…" : "Build it again"}</button>
      ) : null}
    </div>
  );
}

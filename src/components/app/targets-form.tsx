"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ctaClass } from "@/components/brand/primitives";
import { inputClass, labelClass } from "./ui";

interface Estimate { totalUsd: number; note: string; lines: { label: string; usd: number }[] }
const money = (v: number) => "$" + (v < 1 ? v.toFixed(3) : v.toFixed(2));

/**
 * Step 3 of the citation workflow: up to three competitor websites (prefilled from stored scans
 * when known), the estimate (an upper bound), confirm. The server checks and prices everything.
 */
export function TargetsForm({ businessId, packId, suggested, hasDataForSeo, locked }: {
  businessId: string;
  packId: string | null;
  suggested: { name: string | null; domain: string }[];
  hasDataForSeo: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [sites, setSites] = useState<string[]>(() => [0, 1, 2].map((i) => suggested[i]?.domain ?? ""));
  const [fetched, setEstimate] = useState<{ estimate: Estimate; words: string[] } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const competitors = sites.map((s) => s.trim()).filter(Boolean).map((domain) => ({ domain, name: suggested.find((x) => x.domain === domain)?.name ?? null }));
  const ready = competitors.length > 0;
  const shown = ready ? fetched : null;
  const body = (confirm: boolean) => JSON.stringify({ business_id: businessId, ...(packId ? { pack_id: packId } : {}), competitors, confirm });
  const key = body(false);

  useEffect(() => {
    if (!ready) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const res = await fetch("/api/citation-targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: key }).catch(() => null);
      const json = (await res?.json().catch(() => ({}))) as { estimate?: Estimate; url_contains?: string[]; error?: string; message?: string } | undefined;
      if (n !== seq.current) return;
      setEstimate(json?.estimate ? { estimate: json.estimate, words: json.url_contains ?? [] } : null);
      setProblem(json?.error === "confirmation_required" ? null : (json?.message ?? "Could not estimate this search."));
    }, 500);
    return () => clearTimeout(t);
  }, [key, ready]);

  async function run() {
    setBusy(true);
    setProblem(null);
    const res = await fetch("/api/citation-targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: body(true) }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { ok?: boolean; message?: string } | undefined;
    setBusy(false);
    if (!json?.ok) {
      setProblem(json?.message ?? "The search could not start. Nothing was charged.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-3">
        <span className={labelClass}>Competitor websites (up to three)</span>
        {sites.map((s, i) => (
          <input key={i} className={inputClass} aria-label={`Competitor ${i + 1}`} value={s} placeholder="competitor.com" maxLength={253} onChange={(e) => setSites((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))} />
        ))}
        <p className="m-0 text-[13px] text-dim">
          {suggested.length ? "Prefilled with businesses the answers named most often, with the website a stored Google Maps scan gives them. " : "Type their websites: no stored scan gives them. "}
          DataForSEO lists the pages that link to them from a list page (the address contains {fetched?.words.length ? fetched.words.map((w) => `"${w}"`).join(", ") : "best, top- or review"}). Pages your prompt packs saw cited are added and listed first.
        </p>
      </div>
      <aside className="flex h-fit min-w-0 flex-col gap-4 rounded-[14px] border border-border bg-inset p-5" aria-live="polite">
        <span className="font-mono text-[11.5px] tracking-[0.08em] text-dim uppercase">Estimate before you run</span>
        {shown ? (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-[40px] leading-none font-semibold tracking-[-0.03em]">≤ {money(shown.estimate.totalUsd)}</span>
              <span className="text-[15px] text-muted-foreground">on your DataForSEO</span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
              {shown.estimate.lines.map((l) => <li key={l.label} className="flex justify-between gap-3 text-muted-foreground"><span>{l.label}</span><span className="font-mono text-fg">{money(l.usd)}</span></li>)}
            </ul>
            <p className="m-0 text-[13px] leading-normal text-dim">{shown.estimate.note}</p>
          </>
        ) : <p className="m-0 text-[15px] text-muted-foreground">Add a competitor website to see the cost.</p>}
        {!hasDataForSeo ? <p role="alert" className="m-0 text-[14px] text-danger">Add your DataForSEO login in Settings → API keys first: this step runs on your own DataForSEO account only.</p> : null}
        {problem ? <p role="alert" className="m-0 text-[14px] text-danger">{problem}</p> : null}
        <button type="button" onClick={run} disabled={!ready || busy || locked || !shown || !hasDataForSeo} aria-busy={busy} className={ctaClass("block", "cursor-pointer border-0 text-[16px]")}>
          <span>{busy ? "Starting…" : locked ? "Needs lifetime access" : "Find citation targets"}</span>
          <span aria-hidden>→</span>
        </button>
      </aside>
    </div>
  );
}

/** While a search works, ask for its status and refresh the page when it ends. */
export function TargetsPoller({ listId, status }: { listId: string; status: string }) {
  const router = useRouter();
  const open = status === "queued" || status === "running";
  useEffect(() => {
    if (!open) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const res = await fetch(`/api/citation-targets/${listId}`, { cache: "no-store" }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as { status?: string } | null;
      if (stop) return;
      if (json?.status && json.status !== status) router.refresh();
      else timer = setTimeout(tick, 5000);
    };
    timer = setTimeout(tick, 4000);
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [listId, status, open, router]);
  return open ? <p className="m-0 text-[14px] text-muted-foreground" aria-live="polite">Asking DataForSEO… this page updates by itself.</p> : null;
}

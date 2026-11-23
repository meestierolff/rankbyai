"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ctaClass } from "@/components/brand/primitives";
import { Segmented } from "@/components/brand/segmented";
import { ENGINE_LABEL, ENGINES, type Engine } from "@/lib/pricing-constants";
import { inputClass, labelClass } from "./ui";

/** The estimate as the server sends it (lib/packs/estimate PackEstimate); nothing here is trusted. */
interface PackEstimate {
  totalUsd: number;
  highUsd: number;
  basis: string;
  scans: number;
  answers: number;
  note: string;
  lines: { provider: string; label: string; usd: number }[];
  alternatives?: { location: "pin" | "grid"; grid_size: number; answers: number; totalUsd: number; highUsd: number }[];
}

const money = (v: number) => "$" + (v < 1 ? v.toFixed(3) : v.toFixed(2));
const MAX_PROMPTS = 15;
type Where = "pin" | "3" | "5";

/**
 * Step 1 of the citation workflow: edit the buyer prompts, see the estimate (with the same pack at
 * the map point and on the grids), confirm. The server recomputes and checks everything.
 */
export function PackForm({ businessId, defaultService, suggestions, enginesWithKeys, locked }: {
  businessId: string;
  defaultService: string;
  suggestions: string[];
  enginesWithKeys: Engine[];
  locked: boolean;
}) {
  const router = useRouter();
  const [service, setService] = useState(defaultService);
  const [prompts, setPrompts] = useState<string[]>(suggestions.length ? suggestions : [""]);
  const [engines, setEngines] = useState<Engine[]>(enginesWithKeys.length ? enginesWithKeys : [...ENGINES]);
  const [where, setWhere] = useState<Where>("pin");
  const [repeats, setRepeats] = useState(1);
  const [name, setName] = useState("");
  const [fetched, setEstimate] = useState<PackEstimate | null>(null);
  const [fetchedMissing, setMissing] = useState<Engine[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const cleaned = prompts.map((p) => p.trim()).filter(Boolean);
  const body = (confirm: boolean) => ({
    business_id: businessId, service: service.trim(), prompts: cleaned, engines, name: name.trim() || undefined,
    location: where === "pin" ? "pin" : "grid", grid_size: where === "5" ? 5 : 3, repeats, confirm,
  });
  const ready = service.trim().length >= 2 && cleaned.length > 0 && engines.length > 0;
  // An estimate is shown only for a complete setup; an incomplete one shows none.
  const estimate = ready ? fetched : null;
  const missing = ready ? fetchedMissing : [];

  // Live estimate: ask the server (no confirm) whenever the setup changes.
  const key = JSON.stringify(body(false));
  useEffect(() => {
    if (!ready) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const res = await fetch("/api/packs", { method: "POST", headers: { "Content-Type": "application/json" }, body: key }).catch(() => null);
      const json = (await res?.json().catch(() => ({}))) as { estimate?: PackEstimate; missing_keys?: Engine[]; error?: string; message?: string } | undefined;
      if (n !== seq.current) return;
      setEstimate(json?.estimate ?? null);
      setMissing(json?.missing_keys ?? []);
      setProblem(json?.error === "confirmation_required" ? null : (json?.message ?? "Could not estimate this pack."));
    }, 400);
    return () => clearTimeout(t);
  }, [key, ready]);

  async function run() {
    setBusy(true);
    setProblem(null);
    const res = await fetch("/api/packs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body(true)) }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { ok?: boolean; pack_id?: string; message?: string } | undefined;
    setBusy(false);
    if (!json?.ok || !json.pack_id) {
      setProblem(json?.message ?? "The pack could not start. Nothing was charged.");
      return;
    }
    router.push(`/app/businesses/${businessId}/citations?pack=${json.pack_id}`);
    router.refresh();
  }

  const setPrompt = (i: number, v: string) => setPrompts((xs) => xs.map((x, j) => (j === i ? v : x)));
  const toggle = (e: Engine) => setEngines((xs) => (xs.includes(e) ? xs.filter((x) => x !== e) : [...xs, e]));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className={labelClass}>Service people search for</span>
            <input className={inputClass} value={service} onChange={(e) => setService(e.target.value)} maxLength={120} placeholder="dentist" />
          </label>
          <label className="flex flex-col gap-2">
            <span className={labelClass}>Pack name (optional)</span>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={`${service || "service"}: buyer prompts`} />
          </label>
        </div>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className={`${labelClass} mb-2`}>Buyer prompts ({cleaned.length} of {MAX_PROMPTS})</legend>
          <p className="m-0 text-[13px] text-dim">Suggested from the business&apos;s stored fields and the businesses its stored answers named. Edit, remove or add your own, in any language. Each prompt is asked as written.</p>
          {prompts.map((p, i) => (
            <div key={i} className="flex gap-2">
              <input className={inputClass} aria-label={`Prompt ${i + 1}`} value={p} maxLength={300} onChange={(e) => setPrompt(i, e.target.value)} />
              <button type="button" className="cursor-pointer rounded-[10px] border border-border bg-transparent px-3 text-[13px] text-muted-foreground" onClick={() => setPrompts((xs) => xs.filter((_, j) => j !== i))} aria-label={`Remove prompt ${i + 1}`}>Remove</button>
            </div>
          ))}
          <button type="button" disabled={prompts.length >= MAX_PROMPTS} onClick={() => setPrompts((xs) => [...xs, ""])} className="w-fit cursor-pointer rounded-[10px] border border-border bg-transparent px-3 py-2 text-[14px] text-fg disabled:opacity-50">Add a prompt</button>
        </fieldset>

        <div className="flex flex-col gap-2">
          <span className={labelClass}>Engines</span>
          <div className="flex flex-wrap gap-3">
            {ENGINES.map((e) => (
              <label key={e} className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={engines.includes(e)} onChange={() => toggle(e)} />
                {ENGINE_LABEL[e].short}
                {!enginesWithKeys.includes(e) ? <span className="text-[12px] text-dim">(no key)</span> : null}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className={labelClass}>Where to ask</span>
            <Segmented<Where> label="Where to ask" value={where} onChange={setWhere} options={[{ value: "pin", label: "Map point" }, { value: "3", label: "3×3 grid" }, { value: "5", label: "5×5 grid" }]} />
          </div>
          <div className="flex flex-col gap-2">
            <span className={labelClass}>Runs of each prompt</span>
            <Segmented<number> label="Runs of each prompt" value={repeats} onChange={setRepeats} options={[{ value: 1, label: "1" }, { value: 2, label: "2" }, { value: 3, label: "3" }]} />
            <span className="text-[13px] text-dim">One run is not a ranking. 2 runs make a baseline you can compare later; each run costs one more scan per prompt.</span>
          </div>
        </div>
      </div>

      <aside className="flex h-fit min-w-0 flex-col gap-4 rounded-[14px] border border-border bg-inset p-5" aria-live="polite">
        <span className="font-mono text-[11.5px] tracking-[0.08em] text-dim uppercase">Estimate before you run</span>
        {estimate ? (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-[40px] leading-none font-semibold tracking-[-0.03em]">≈ {money(estimate.totalUsd)}</span>
              <span className="text-[15px] text-muted-foreground">on your keys</span>
            </div>
            <p className="m-0 text-[13px] text-dim">{estimate.note}</p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
              {estimate.lines.map((l) => (
                <li key={l.label} className="flex justify-between gap-3 text-muted-foreground"><span>{l.label}</span><span className="font-mono text-fg">{money(l.usd)}</span></li>
              ))}
            </ul>
            {estimate.alternatives?.length ? (
              <div className="flex flex-col gap-1 text-[13px]">
                <span className="text-dim">The same pack:</span>
                {estimate.alternatives.map((a) => (
                  <span key={a.grid_size} className="flex justify-between gap-3 text-muted-foreground">
                    <span>{a.location === "pin" ? "at the map point" : `on a ${a.grid_size}×${a.grid_size} grid`} ({a.answers} answers)</span>
                    <span className="font-mono">{money(a.totalUsd)}</span>
                  </span>
                ))}
              </div>
            ) : null}
            <p className="m-0 text-[13px] leading-normal text-dim">
              Estimate from {estimate.basis}. {estimate.highUsd > estimate.totalUsd + 0.0005 ? `Up to ${money(estimate.highUsd)} if your Gemini key is past its free monthly grounding allowance. ` : ""}Your vendors bill you; the actual cost is shown after the run.
            </p>
          </>
        ) : (
          <p className="m-0 text-[15px] text-muted-foreground">Add a service and at least one prompt to see the cost.</p>
        )}
        {missing.length ? (
          <p role="alert" className="m-0 text-[14px] text-danger">
            No key for {missing.map((e) => ENGINE_LABEL[e].short).join(", ")}. Add it in <Link href="/app/settings/keys" className="underline">Settings → API keys</Link> or untick it. Prompt packs run on your own keys only.
          </p>
        ) : null}
        {problem ? <p role="alert" className="m-0 text-[14px] text-danger">{problem}</p> : null}
        <button type="button" onClick={run} disabled={!ready || busy || locked || !estimate || missing.length > 0} aria-busy={busy} className={ctaClass("block", "cursor-pointer border-0 text-[16px]")}>
          <span>{busy ? "Starting…" : locked ? "Needs lifetime access" : estimate ? `Run ${estimate.scans} ${estimate.scans === 1 ? "scan" : "scans"}` : "Run the pack"}</span>
          <span aria-hidden>→</span>
        </button>
      </aside>
    </div>
  );
}

/** Run a saved pack again with its own prompts and settings: estimate first, then confirm. */
export function PackRerun({ packId, businessId, locked }: { packId: string; businessId: string; locked: boolean }) {
  const router = useRouter();
  const [estimate, setEstimate] = useState<PackEstimate | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(confirm: boolean) {
    setBusy(true);
    setProblem(null);
    const res = await fetch("/api/packs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pack_id: packId, confirm }) }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string; estimate?: PackEstimate; missing_keys?: Engine[] } | undefined;
    setBusy(false);
    if (!confirm) {
      if (json?.error === "confirmation_required" && json.estimate) {
        setEstimate(json.estimate);
        if (json.missing_keys?.length) setProblem(`No key for ${json.missing_keys.map((e) => ENGINE_LABEL[e].short).join(", ")}: add it in Settings → API keys first.`);
      } else setProblem(json?.message ?? "Could not estimate this run.");
      return;
    }
    if (!json?.ok) {
      setProblem(json?.message ?? "The run could not start. Nothing was charged.");
      return;
    }
    setEstimate(null);
    router.push(`/app/businesses/${businessId}/citations?pack=${packId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-[14px]">
      {estimate ? (
        <>
          <span className="text-muted-foreground">Run again: ≈ <span className="font-mono text-fg">{money(estimate.totalUsd)}</span> on your keys ({estimate.scans} scans)</span>
          <button type="button" disabled={busy || locked} onClick={() => call(true)} className={ctaClass("sm", "cursor-pointer border-0")}>{busy ? "Starting…" : "Confirm and run"}</button>
          <button type="button" onClick={() => setEstimate(null)} className="cursor-pointer border-0 bg-transparent text-dim underline">Cancel</button>
        </>
      ) : (
        <button type="button" disabled={busy || locked} onClick={() => call(false)} className="cursor-pointer rounded-[10px] border border-border bg-transparent px-3 py-2 text-fg">{busy ? "Estimating…" : "Run this pack again"}</button>
      )}
      {problem ? <span role="alert" className="text-danger">{problem}</span> : null}
    </div>
  );
}

/** While a run works, ask for its progress and refresh the page when it moves on. */
export function PackPoller({ packId, runId, status, pagesChecked }: { packId: string; runId: string; status: string; pagesChecked: boolean }) {
  const router = useRouter();
  const settled = (status === "done" || status === "partial" || status === "failed") && (pagesChecked || status === "failed");
  useEffect(() => {
    if (settled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop = false;
    const tick = async () => {
      const res = await fetch(`/api/packs/${packId}?run_id=${runId}`, { cache: "no-store" }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as { status?: string; pages_checked?: boolean } | null;
      if (stop) return;
      if (json && (json.status !== status || json.pages_checked !== pagesChecked)) router.refresh();
      else timer = setTimeout(tick, 6000);
    };
    timer = setTimeout(tick, 4000);
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [packId, runId, status, pagesChecked, settled, router]);
  if (settled) return null;
  return <p className="m-0 text-[14px] text-muted-foreground" aria-live="polite">{status === "queued" || status === "running" ? "Asking the engines… this page updates by itself." : "Reading the most-cited pages…"}</p>;
}

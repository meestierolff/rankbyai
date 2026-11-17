"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ctaClass } from "@/components/brand/primitives";
import { Segmented } from "@/components/brand/segmented";
import { track } from "@/lib/analytics";
import { ENGINE_LABEL, ENGINES, type Engine } from "@/lib/pricing-constants";
import { DEFAULT_PROMPT_TEMPLATE } from "@/lib/scans/prompt";
import { inputClass, labelClass } from "./ui";

export interface FormBusiness {
  id: string;
  name: string;
  city: string | null;
  category: string | null;
}

interface Estimate {
  totalUsd: number;
  highUsd: number;
  credits: number;
  basis: string;
  lines: { provider: string; label: string; usd: number }[];
}

const money = (v: number) => "$" + (v < 1 ? v.toFixed(3) : v.toFixed(2));

/** Scan setup: pick, see the estimate, confirm. The server recomputes everything; nothing here is trusted. */
export function ScanForm({
  kind, businesses, keys, credits, locked, defaultBusinessId,
}: {
  kind: "ai" | "maps";
  businesses: FormBusiness[];
  keys: Record<"dataforseo" | Engine, boolean>;
  credits: number;
  locked: boolean;
  defaultBusinessId?: string;
}) {
  const router = useRouter();
  const first = businesses.find((b) => b.id === defaultBusinessId) ?? businesses[0];
  const [businessId, setBusinessId] = useState(first?.id ?? "");
  const [keyword, setKeyword] = useState(first?.category ? first.category.toLowerCase() : "");
  const [template, setTemplate] = useState(DEFAULT_PROMPT_TEMPLATE);
  const [funding, setFunding] = useState<"byok" | "credits">("byok");
  const [engines, setEngines] = useState<Engine[]>(ENGINES.filter((e) => keys[e]));
  const [grid, setGrid] = useState<number>(kind === "ai" ? 3 : 7);
  const [radius, setRadius] = useState(2);
  const [mode, setMode] = useState<"standard" | "priority" | "live">("priority");
  const [repeat, setRepeat] = useState<"none" | "weekly" | "monthly">("none");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const usable = (e: Engine) => funding === "credits" || keys[e];
  const activeEngines = engines.filter(usable);
  const engineKey = activeEngines.join(",");

  const body = useCallback(
    (confirm: boolean) => ({
      business_id: businessId, kind, keyword, grid_size: grid, radius_miles: radius, funding, confirm,
      ...(kind === "ai" ? { engines: engineKey ? engineKey.split(",") : [], prompt_template: template === DEFAULT_PROMPT_TEMPLATE ? null : template } : { mode }),
    }),
    [businessId, kind, keyword, grid, radius, funding, mode, template, engineKey],
  );

  // Live estimate: ask the server (no confirm) whenever the setup changes.
  useEffect(() => {
    if (!businessId || keyword.trim().length < 2 || (kind === "ai" && !engineKey)) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      const res = await fetch("/api/scans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body(false)) });
      const json = (await res.json().catch(() => ({}))) as { estimate?: Estimate; error?: string; message?: string };
      if (my !== seq.current) return;
      setEstimate(json.estimate ?? null);
      setProblem(json.error === "confirmation_required" ? null : (json.message ?? "Could not estimate this scan."));
    }, 350);
    return () => clearTimeout(t);
  }, [body, businessId, keyword, kind, engineKey]);

  const ready = !!businessId && keyword.trim().length >= 2 && (kind === "maps" || activeEngines.length > 0);

  const run = async () => {
    setBusy(true);
    setProblem(null);
    const res = await fetch("/api/scans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body(true)) });
    const json = (await res.json().catch(() => ({}))) as { scan_id?: string; message?: string };
    if (res.ok && json.scan_id) {
      track("scan_estimated", { kind, est_usd: estimate?.totalUsd ?? 0, funding });
      if (repeat !== "none") {
        // Opt-in schedule: same setup, re-run every week or month (the first repeat is one period from now).
        const { confirm: _c, mode: _m, ...setup } = body(true) as Record<string, unknown>;
        void _c; void _m;
        await fetch("/api/schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...setup, schedule: repeat }) }).catch(() => {});
      }
      router.push(`/app/${kind === "ai" ? "ai-visibility" : "maps-grid"}/${json.scan_id}`);
      return;
    }
    setBusy(false);
    setProblem(json.message ?? "The scan could not start. Nothing was charged.");
  };

  if (businesses.length === 0) return null;
  const noByokForKind = kind === "maps" ? !keys.dataforseo : !ENGINES.some((e) => keys[e]);

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
              if (b?.category && !keyword) setKeyword(b.category.toLowerCase());
            }}
            className={inputClass}
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>{b.name}{b.city ? ` · ${b.city}` : ""}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>{kind === "ai" ? "Service people ask for" : "Maps keyword"}</span>
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} maxLength={120} placeholder={kind === "ai" ? "dentists" : "dentist near me"} className={inputClass} />
          {kind === "ai" ? <span className="text-[13px] text-dim">Used as {"{service}"} in the prompt, e.g. “Who are the best {keyword || "dentists"} near me?”</span> : null}
        </label>

        {kind === "ai" ? (
          <>
            <div className="flex flex-col gap-[6px]">
              <span className={labelClass}>AI engines</span>
              <Segmented
                label="AI engines"
                value={activeEngines}
                onChange={(v) => setEngines((cur) => (cur.includes(v) ? cur.filter((e) => e !== v) : [...cur, v]))}
                options={ENGINES.map((e) => ({ value: e, label: ENGINE_LABEL[e].short, disabled: !usable(e), title: usable(e) ? ENGINE_LABEL[e].api : "Add a key or use included scans" }))}
              />
              {funding === "byok" && ENGINES.some((e) => !keys[e]) ? <span className="text-[13px] text-dim">Greyed-out engines have no key. Add a key or use included scans.</span> : null}
            </div>
            <details className="rounded-xl border border-border bg-inset px-4 py-3">
              <summary className="text-[14px] font-medium">Prompt</summary>
              <textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={3} maxLength={400} className={`${inputClass} mt-3 font-mono text-[13px]`} />
              <span className="mt-2 block text-[13px] text-dim">Must contain {"{service}"} and {"{neighbourhood}"} or {"{city}"}. The same prompt is sent to every engine and stored with each answer.</span>
            </details>
          </>
        ) : null}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-[6px]">
            <span className={labelClass}>Grid</span>
            <Segmented
              label="Grid size" value={grid} onChange={setGrid}
              options={(kind === "ai" ? [1, 3, 5] : [3, 5, 7, 9]).map((n) => ({ value: n, label: `${n}×${n}` }))}
            />
          </div>
          <div className="flex flex-col gap-[6px]">
            <span className={labelClass}>Radius</span>
            <Segmented
              label="Radius" value={radius} onChange={setRadius}
              options={[{ value: 1, label: "1 mi" }, { value: 2, label: "2 mi" }, { value: 5, label: "5 mi" }, { value: 10, label: "10 mi" }]}
            />
          </div>
        </div>

        {kind === "maps" ? (
          <div className="flex flex-col gap-[6px]">
            <span className={labelClass}>Speed</span>
            <Segmented
              label="Maps speed" value={mode} onChange={setMode}
              options={[{ value: "standard" as const, label: "Standard (~5 min)" }, { value: "priority" as const, label: "Priority (~1 min)" }, { value: "live" as const, label: "Live (seconds)" }]}
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-[6px]">
          <span className={labelClass}>Repeat</span>
          <Segmented
            label="Repeat" value={repeat} onChange={setRepeat}
            options={[{ value: "none" as const, label: "Just once" }, { value: "weekly" as const, label: "Weekly" }, { value: "monthly" as const, label: "Monthly" }]}
          />
          {repeat !== "none" ? (
            <span className="text-[13px] text-dim">
              Runs now, then every {repeat === "weekly" ? "week" : "month"} at about the same cost per run{kind === "maps" ? " (scheduled Maps runs use the cheaper Standard queue)" : ""}. Pause or delete it any time under Schedules.
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-[6px]">
          <span className={labelClass}>Paid with</span>
          <Segmented
            label="Funding" value={funding} onChange={setFunding}
            options={[{ value: "byok" as const, label: "My own keys" }, { value: "credits" as const, label: `Included scans (${credits} left)` }]}
          />
          {funding === "byok" && noByokForKind ? <span className="text-[13px] text-amber">No key for this scan yet. Add one in Settings → API keys, or use included scans.</span> : null}
        </div>
      </div>

      <aside className="flex h-fit flex-col gap-4 rounded-2xl border border-border bg-inset p-5" aria-live="polite">
        <span className="text-[13px] tracking-[0.05em] text-dim uppercase">Estimate before you run</span>
        {estimate ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[40px] leading-none font-semibold tracking-[-0.03em]">
                {funding === "credits" ? estimate.credits : `≈ ${money(estimate.totalUsd)}`}
              </span>
              <span className="text-[15px] text-muted-foreground">{funding === "credits" ? (estimate.credits === 1 ? "credit" : "credits") : "on your keys"}</span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
              {estimate.lines.map((l) => (
                <li key={l.label} className="flex justify-between gap-3 text-muted-foreground">
                  <span>{l.label}</span>
                  <span className="font-mono text-fg">{money(l.usd)}</span>
                </li>
              ))}
            </ul>
            <p className="m-0 text-[13px] leading-normal text-dim">
              {funding === "credits"
                ? "Paid from your included scans. The API cost is ours."
                : `Estimate from ${estimate.basis}. ${estimate.highUsd > estimate.totalUsd + 0.0005 ? `Up to ${money(estimate.highUsd)} if your Gemini key is past its free monthly grounding allowance. ` : ""}Your vendors bill you; the actual cost is shown after the scan.`}
            </p>
          </>
        ) : (
          <p className="m-0 text-[15px] text-muted-foreground">Fill in the setup to see the cost.</p>
        )}
        {problem ? <p role="alert" className="m-0 text-[14px] text-danger">{problem}</p> : null}
        <button type="button" onClick={run} disabled={!ready || busy || locked || !estimate} className={ctaClass("block", "cursor-pointer border-0 text-[16px]")}>
          <span>{busy ? "Starting…" : locked ? "Needs lifetime access" : kind === "ai" ? "Run AI check" : "Run Maps grid"}</span>
          <span aria-hidden>→</span>
        </button>
      </aside>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ctaClass } from "@/components/brand/primitives";
import { Segmented } from "@/components/brand/segmented";
import { track } from "@/lib/analytics";
import { AI_GRID_SIZES, ENGINE_LABEL, ENGINES, MAPS_GRID_SIZES, type Engine } from "@/lib/pricing-constants";
import { DEFAULT_PROMPT_TEMPLATE } from "@/lib/scans/prompt";
import { skippedLine } from "@/lib/scans/skip";
import { creditsBlocker, creditsLeft, defaultFunding, plural, scanCredits, type FundingChoice } from "./first-run";
import { GridPicker } from "./grid-picker";
import type { IncludedScans } from "./included";
import { inputClass, labelClass } from "./ui";

export interface FormBusiness {
  id: string;
  name: string;
  city: string | null;
  category: string | null;
  /** The listing's location: the grid's centre. Lets the point picker show the grid on the map. */
  lat?: number | null;
  lng?: number | null;
}

interface Estimate {
  /** Points that will be checked and points skipped, as the server counted them. */
  points?: number;
  skipped?: number;
  totalUsd: number;
  highUsd: number;
  credits: number;
  basis: string;
  lines: { provider: string; label: string; usd: number }[];
}

const money = (v: number) => "$" + (v < 1 ? v.toFixed(3) : v.toFixed(2));

/** Scan setup: pick, see the estimate, confirm. The server recomputes everything; nothing here is trusted. */
export function ScanForm({
  kind, businesses, keys, credits, included, locked, defaultBusinessId,
}: {
  kind: "ai" | "maps";
  businesses: FormBusiness[];
  keys: Record<"dataforseo" | Engine, boolean>;
  credits: number;
  /** Which of our own keys are in place, i.e. what included scans can run today. */
  included: IncludedScans;
  locked: boolean;
  defaultBusinessId?: string;
}) {
  const router = useRouter();
  const first = businesses.find((b) => b.id === defaultBusinessId) ?? businesses[0];
  const ownKeys = kind === "maps" ? keys.dataforseo : ENGINES.some((e) => keys[e]);
  const includedOpen = kind === "maps" ? included.dataforseo : included.engines.length > 0;
  const firstGrid = kind === "ai" ? 3 : 7;
  // Open on what this workspace can actually run: its own keys, or included scans when it has
  // credits and no keys.
  const firstFunding = defaultFunding({ ownKeys, credits, cost: scanCredits(kind, firstGrid), includedOpen });
  const enginesFor = (f: FundingChoice) => ENGINES.filter((e) => (f === "credits" ? included.engines.includes(e) : keys[e]));

  const [businessId, setBusinessId] = useState(first?.id ?? "");
  const [keyword, setKeyword] = useState(first?.category ? first.category.toLowerCase() : "");
  const [template, setTemplate] = useState(DEFAULT_PROMPT_TEMPLATE);
  const [funding, setFunding] = useState<FundingChoice>(firstFunding);
  const [engines, setEngines] = useState<Engine[]>(() => enginesFor(firstFunding));
  const [grid, setGrid] = useState<number>(firstGrid);
  // Grid points the user switched off (idx = row × n + col). Cleared when the grid or the business changes.
  const [skip, setSkip] = useState<number[]>([]);
  const [radius, setRadius] = useState(2);
  const [mode, setMode] = useState<"standard" | "priority" | "live">("priority");
  const [repeat, setRepeat] = useState<"none" | "weekly" | "monthly">("none");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  // The grid size and number of skipped points the request behind `estimate` carried.
  const [estimateFor, setEstimateFor] = useState({ grid: firstGrid, skip: 0 });
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const usable = (e: Engine) => (funding === "credits" ? included.engines.includes(e) : keys[e]);
  const activeEngines = engines.filter(usable);
  const engineKey = activeEngines.join(",");
  const business = businesses.find((b) => b.id === businessId) ?? null;
  const center = business?.lat != null && business?.lng != null ? { lat: business.lat, lng: business.lng } : null;
  // The estimate on screen is for another grid or skip list while a new one is being estimated.
  const estimateStale = !!estimate && (estimateFor.grid !== grid || estimateFor.skip !== skip.length);
  // Fail closed: if the server's estimate does not count the skipped points, running would check
  // (and charge for) the whole grid.
  const skipIgnored = !!estimate && !estimateStale && skip.length > 0 && estimate.skipped !== skip.length;
  const cost = estimate && !estimateStale && !skipIgnored ? estimate.credits : scanCredits(kind, grid, skip.length);
  // Said next to the form, before submit: the server would answer the same after it.
  const blocker = funding === "credits" ? creditsBlocker({ credits, cost, includedOpen }) : null;
  const canUseCredits = creditsBlocker({ credits, cost, includedOpen }) === null;

  const pickFunding = (f: FundingChoice) => {
    setFunding(f);
    // Keep the engine choice when it still works; otherwise select what this funding can run.
    const can = enginesFor(f);
    setEngines((cur) => (cur.some((e) => can.includes(e)) ? cur : can));
  };

  const body = useCallback(
    (confirm: boolean) => ({
      business_id: businessId, kind, keyword, grid_size: grid, radius_miles: radius, funding, confirm,
      ...(skip.length ? { skip_points: skip } : {}),
      ...(kind === "ai" ? { engines: engineKey ? engineKey.split(",") : [], prompt_template: template === DEFAULT_PROMPT_TEMPLATE ? null : template } : { mode }),
    }),
    [businessId, kind, keyword, grid, skip, radius, funding, mode, template, engineKey],
  );

  // Live estimate: ask the server (no confirm) whenever the setup changes.
  useEffect(() => {
    if (!businessId || keyword.trim().length < 2 || (kind === "ai" && !engineKey)) return;
    const my = ++seq.current;
    const sent = body(false);
    const t = setTimeout(async () => {
      const res = await fetch("/api/scans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sent) });
      const json = (await res.json().catch(() => ({}))) as { estimate?: Estimate; error?: string; message?: string };
      if (my !== seq.current) return;
      setEstimate(json.estimate ?? null);
      setEstimateFor({ grid: sent.grid_size, skip: Array.isArray(sent.skip_points) ? sent.skip_points.length : 0 });
      setProblem(json.error === "confirmation_required" ? null : (json.message ?? "Could not estimate this scan."));
    }, 350);
    return () => clearTimeout(t);
  }, [body, businessId, keyword, kind, engineKey]);

  const ready = !!businessId && keyword.trim().length >= 2 && (kind === "maps" || activeEngines.length > 0) && !estimateStale && !skipIgnored;

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
  const what = kind === "ai" ? "check" : "grid";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Business</span>
          <select
            value={businessId}
            onChange={(e) => {
              setBusinessId(e.target.value);
              setSkip([]); // skipped points belong to one business's surroundings
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
                options={ENGINES.map((e) => ({
                  value: e, label: ENGINE_LABEL[e].short, disabled: !usable(e),
                  title: usable(e) ? ENGINE_LABEL[e].api : funding === "credits" ? "Not available on included scans today" : "Add a key or use included scans",
                }))}
              />
              {funding === "byok" && ENGINES.some((e) => !keys[e]) ? <span className="text-[13px] text-dim">Greyed-out engines have no key. Add a key{canUseCredits ? " or use included scans" : " in Settings → API keys"}.</span> : null}
              {funding === "credits" && includedOpen && ENGINES.some((e) => !included.engines.includes(e)) ? <span className="text-[13px] text-dim">Greyed-out engines are not available on included scans today.</span> : null}
            </div>
            <details className="rounded-xl border border-border bg-inset px-4 py-3">
              <summary className="text-[14px] font-medium">Prompt</summary>
              <textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={3} maxLength={400} className={`${inputClass} mt-3 font-mono text-[13px]`} />
              <span className="mt-2 block text-[13px] text-dim">Must contain {"{service}"} and {"{neighbourhood}"} or {"{city}"}. The same prompt is sent to every engine and stored with each answer.</span>
            </details>
          </>
        ) : null}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-[6px]">
            <span className={labelClass}>Grid</span>
            <Segmented
              label="Grid size" value={grid}
              onChange={(n) => {
                setGrid(n);
                setSkip([]); // a point number means a different place on another grid size
              }}
              columns={kind === "maps" ? 4 : undefined}
              options={(kind === "ai" ? AI_GRID_SIZES : MAPS_GRID_SIZES).map((n) => ({ value: n as number, label: `${n}×${n}` }))}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-[6px]">
            <span className={labelClass}>Radius</span>
            <Segmented
              label="Radius" value={radius} onChange={setRadius}
              options={[{ value: 1, label: "1 mi" }, { value: 2, label: "2 mi" }, { value: 5, label: "5 mi" }, { value: 10, label: "10 mi" }]}
            />
          </div>
        </div>

        {grid > 1 ? (
          <details className="rounded-xl border border-border bg-inset px-4 py-3">
            <summary className="text-[14px] font-medium">
              Skip points <span className="font-normal text-dim">· {skip.length ? skippedLine(grid, skip.length) : "all points checked"}</span>
            </summary>
            <div className="mt-3">
              <GridPicker n={grid} skip={skip} onChange={setSkip} center={center} radiusMiles={radius} />
            </div>
          </details>
        ) : null}

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
              Runs now, then every {repeat === "weekly" ? "week" : "month"} at about the same cost per run{kind === "maps" ? " (scheduled Maps runs use the cheaper Standard queue)" : ""}.{skip.length ? ` The ${plural(skip.length, "skipped point")} stay skipped on every run.` : ""} Pause or delete it any time under Schedules.
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-[6px]">
          <span className={labelClass}>Paid with</span>
          {/* Short labels: the balance is in the line below, so a large number can never cut the label off. */}
          <Segmented
            label="Funding" value={funding} onChange={pickFunding}
            options={[{ value: "byok" as const, label: "My own keys" }, { value: "credits" as const, label: "Included scans" }]}
          />
          {funding === "credits" ? (
            blocker ? <span className="text-[13px] text-amber">{blocker}</span> : (
              <span className="text-[13px] text-dim">This {what} costs {plural(cost, "credit")}. You have {creditsLeft(credits)}. The API cost is ours.</span>
            )
          ) : !ownKeys ? (
            <span className="text-[13px] text-amber">
              No key for this scan yet. Add one in Settings → API keys{canUseCredits ? `, or use included scans (${plural(credits, "credit")} left)` : ""}.
            </span>
          ) : (
            <span className="text-[13px] text-dim">Your vendors bill you at their rates.{credits > 0 ? ` You also have ${creditsLeft(credits)}.` : ""}</span>
          )}
        </div>
      </div>

      <aside className="flex h-fit min-w-0 flex-col gap-4 rounded-[14px] border border-border bg-inset p-5" aria-live="polite">
        <span className="font-mono text-[11.5px] tracking-[0.08em] text-dim uppercase">Estimate before you run</span>
        {estimate ? (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-[40px] leading-none font-semibold tracking-[-0.03em]">
                {funding === "credits" ? estimate.credits : `≈ ${money(estimate.totalUsd)}`}
              </span>
              <span className="text-[15px] text-muted-foreground">{funding === "credits" ? (estimate.credits === 1 ? "credit" : "credits") : "on your keys"}</span>
            </div>
            {estimate.skipped ? <p className="m-0 text-[13px] text-dim">{skippedLine(grid, estimate.skipped)}: not looked up and not charged.</p> : null}
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
        {skipIgnored ? (
          <p role="alert" className="m-0 text-[14px] text-danger">
            The server did not count your skipped points, so this run would check the whole grid. It is blocked; reload the page and try again, or choose Skip none.
          </p>
        ) : null}
        <button type="button" onClick={run} disabled={!ready || busy || locked || !estimate || !!blocker} aria-busy={busy} className={ctaClass("block", "cursor-pointer border-0 text-[16px]")}>
          <span>{busy ? "Starting…" : locked ? "Needs lifetime access" : kind === "ai" ? "Run AI check" : "Run Maps grid"}</span>
          <span aria-hidden>→</span>
        </button>
      </aside>
    </div>
  );
}

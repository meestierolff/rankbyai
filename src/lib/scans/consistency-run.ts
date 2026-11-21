import "server-only";
import { randomUUID } from "node:crypto";
import { BYOK_MAX_RUNNING_SCANS, creditsFor, houseBudgetCheck, runningScanCount, type Estimate, type HouseFunding } from "@/lib/cost-guard";
import { languageName } from "@/lib/countries";
import { dbAdmin } from "@/lib/db/clients";
import type { Funding } from "@/lib/keys";
import type { AiGridSize, Engine } from "@/lib/pricing-constants";
import type { Read } from "./change-note-data";
import { samePlace } from "./compare";
import { CONSISTENCY_DISCLAIMER, RUN_ROLES, compareRuns, parseRunLabel, runLabel, type RunComparison, type RunRole, type RunSample } from "./consistency";
import { createScan, processScan } from "./engine";
import { DEFAULT_PROMPT_TEMPLATE, QUESTIONS, validateTemplate } from "./prompt";

/**
 * Starting and reading consistency runs (lib/scans/consistency). Money rules, all checked before
 * the first run is created: the estimate is the number of runs × one grid's estimate; room for one
 * running scan (the runs go one after another); credits for every run; today's house cap for every
 * run. If a run cannot be created after all, the runs already created are refunded and removed.
 */

export interface SecondLanguage {
  /** A language RankbyAI has a written question in ("de", "nl", …), or "en" for the standard English question. */
  language?: string;
  /** Or the user's own question; it must contain {service} and {neighbourhood} or {city}. */
  promptTemplate?: string;
  /** The service as people say it in that language, e.g. "Zahnarzt". Never translated for the user. */
  keyword: string;
}

export interface ConsistencyInput {
  workspaceId: string;
  plan: "locked" | "lifetime";
  businessId: string;
  keyword: string;
  grid: AiGridSize;
  engines: Engine[];
  radiusMiles: number;
  promptTemplate?: string | null;
  skip?: number[];
  center?: { lat: number; lng: number } | null;
  funding: Extract<Funding, "byok" | "credits">;
  /** 2 = ask each question twice. */
  repeat: 1 | 2;
  second?: SecondLanguage | null;
  confirm: boolean;
}

export type ConsistencyStart =
  | { ok: true; groupId: string; runs: { role: RunRole; scanId: string }[]; estimate: GroupEstimate }
  | { ok: false; status: number; error: string; message: string; estimate?: GroupEstimate };

export interface GroupEstimate extends Estimate {
  runs: number;
  perRunUsd: number;
  perRunCredits: number;
  note: string;
}

export const SECOND_LANGUAGES = ["en", ...Object.keys(QUESTIONS)] as const;
const languageLabel = (code: string) => (code === "en" ? "English" : (languageName(code) ?? code));

/** The question a second-language run asks, or an error message. */
export function secondTemplate(second: SecondLanguage): { template: string } | { error: string } {
  if (second.promptTemplate?.trim()) {
    const e = validateTemplate(second.promptTemplate.trim());
    return e ? { error: `second_language.prompt_template: ${e}` } : { template: second.promptTemplate.trim() };
  }
  const code = (second.language ?? "").toLowerCase();
  if (code === "en") return { template: DEFAULT_PROMPT_TEMPLATE };
  if (Object.hasOwn(QUESTIONS, code)) return { template: QUESTIONS[code].template };
  return { error: `second_language.language: RankbyAI has a written question in ${SECOND_LANGUAGES.join(", ")}. Send one of those, or your own prompt_template.` };
}

export function runPlan(repeat: 1 | 2, second: boolean): RunRole[] {
  return RUN_ROLES.filter((r) => (r[1] === "2" ? repeat === 2 : true) && (r[0] === "B" ? second : true));
}

/** N runs × one grid: the single-grid estimate, repeated per run, nothing hidden. */
export function groupEstimate(single: Estimate, roles: RunRole[], secondLabel: string | null): GroupEstimate {
  const n = roles.length;
  const what: Record<RunRole, string> = { A1: "Run 1: the question as asked", A2: "Run 2: the same question again", B1: `Run 3: the question in ${secondLabel ?? "the second language"}`, B2: `Run 4: the ${secondLabel ?? "second-language"} question again` };
  return {
    ...single,
    totalUsd: single.totalUsd * n,
    highUsd: single.highUsd * n,
    credits: single.credits * n,
    // One line per run and engine, each with the vendor it bills: the same lines as one grid, once per run.
    lines: roles.flatMap((r) => single.lines.map((l) => ({ provider: l.provider, label: `${what[r]}: ${l.label}`, usd: l.usd }))),
    runs: n,
    perRunUsd: single.totalUsd,
    perRunCredits: single.credits,
    note: `${n} runs of the same grid, one after another: ${n} × one grid's estimate. A run that fails is not repeated.`,
  };
}

export async function startConsistency(input: ConsistencyInput): Promise<ConsistencyStart> {
  const roles = runPlan(input.repeat, !!input.second);
  if (roles.length < 2) return { ok: false, status: 400, error: "invalid_request", message: "Ask for repeat: 2, a second_language, or both: one run alone measures nothing." };
  let templateB: string | null = null;
  if (input.second) {
    const t = secondTemplate(input.second);
    if ("error" in t) return { ok: false, status: 400, error: "invalid_prompt", message: t.error };
    templateB = t.template;
  }
  const secondLabel = input.second ? (input.second.promptTemplate?.trim() ? "your second question" : languageLabel((input.second.language ?? "").toLowerCase())) : null;
  const spec = { kind: "ai" as const, grid: input.grid, engines: input.engines, skip: input.skip };
  const common = { workspaceId: input.workspaceId, plan: input.plan, businessId: input.businessId, spec, radiusMiles: input.radiusMiles, funding: input.funding, center: input.center ?? null };

  // A dry run of the first scan checks the business, grid, centre and question, and gives one grid's estimate.
  const dry = await createScan({ ...common, keyword: input.keyword, promptTemplate: input.promptTemplate, confirm: false });
  if (dry.ok || dry.error !== "confirmation_required" || !dry.estimate) return dry.ok ? { ok: false, status: 500, error: "server_error", message: "Unexpected run." } : { ok: false, status: dry.status, error: dry.error, message: dry.message };
  const estimate = groupEstimate(dry.estimate, roles, secondLabel);
  if (!input.confirm) return { ok: false, status: 409, error: "confirmation_required", message: "Review the estimate, then confirm to run.", estimate };

  // Everything the whole group needs, before any run exists.
  if (input.plan !== "lifetime") return { ok: false, status: 403, error: "lifetime_required", message: "Running scans needs lifetime access.", estimate };
  if (input.funding === "byok" && (await runningScanCount(input.workspaceId)) >= BYOK_MAX_RUNNING_SCANS) {
    return { ok: false, status: 429, error: "too_many_running", message: `You already have ${BYOK_MAX_RUNNING_SCANS} scans running. Wait for one to finish.`, estimate };
  }
  if (input.funding === "credits") {
    const need = creditsFor(spec) * roles.length;
    const { data: balance } = await dbAdmin().rpc("credit_balance", { p_workspace_id: input.workspaceId });
    if (Number(balance ?? 0) < need) return { ok: false, status: 402, error: "insufficient_credits", message: `This needs ${need} scan credits (${roles.length} runs). Buy a pack on the Billing page, or run it on your own keys.`, estimate };
    const cap = await houseBudgetCheck(input.funding as HouseFunding, estimate.highUsd);
    if (!cap.ok) return { ok: false, status: 429, error: "daily_cap", message: cap.message ?? "Daily capacity reached.", estimate };
  }

  const groupId = randomUUID();
  const runs: { role: RunRole; scanId: string }[] = [];
  for (const role of roles) {
    const b = role[0] === "B";
    const r = await createScan({
      ...common, keyword: b ? input.second!.keyword : input.keyword, promptTemplate: b ? templateB : input.promptTemplate,
      label: runLabel(groupId, role), groupMember: true, confirm: true,
    });
    if (!r.ok) {
      // All or nothing: give back what the runs created so far consumed, and remove them.
      for (const done of runs) {
        await dbAdmin().rpc("refund_credits", { p_scan_id: done.scanId });
        await dbAdmin().from("scans").delete().eq("id", done.scanId);
      }
      return { ok: false, status: r.status, error: r.error, message: `${r.message} No run of this check was started.`, estimate };
    }
    runs.push({ role, scanId: r.scanId });
  }
  return { ok: true, groupId, runs, estimate };
}

/** Works through a group's runs in order (one at a time), within the time budget. Later polls continue the rest. */
export async function processGroup(scanIds: string[], budgetMs = 270_000): Promise<void> {
  const end = Date.now() + budgetMs;
  for (const id of scanIds) {
    const left = end - Date.now();
    if (left < 60_000) return;
    await processScan(id, Math.min(240_000, left - 15_000));
    const { data } = await dbAdmin().from("scans").select("status").eq("id", id).maybeSingle<{ status: string }>();
    // Not finished within its budget (the Maps queue, a slow engine): leave the order to the next poll.
    if (data && (data.status === "queued" || data.status === "running")) return;
  }
}

// ───────────────────────── reading ─────────────────────────

const RUN_COLS = "id, business_id, kind, status, created_at, niche, keyword, prompt_template, grid_size, engines, center_lat, center_lng, radius_miles, label, lease_until";
interface RunRow {
  id: string; business_id: string; kind: string; status: string; created_at: string; niche: string | null; keyword: string | null; prompt_template: string | null;
  grid_size: number; engines: Engine[]; center_lat: number | null; center_lng: number | null; radius_miles: number | string | null; label: string | null; lease_until: string | null;
}

/** "German", "English", or "a custom question". */
export function questionLabel(template: string | null): string {
  const t = template ?? DEFAULT_PROMPT_TEMPLATE;
  if (t === DEFAULT_PROMPT_TEMPLATE) return "English";
  const code = Object.entries(QUESTIONS).find(([, q]) => q.template === t)?.[0];
  return code ? languageLabel(code) : "a custom question";
}

export interface ConsistencyReport {
  group_id: string | null;
  business: string;
  /** Points per side of the grid every run used (for naming points). */
  grid_size: number;
  status: "running" | "done";
  runs: { role: RunRole; scan_id: string; status: string; service: string | null; question: string; created_at: string }[];
  /** Run 1 against run 2: how much the same question varies. */
  same_question: RunComparison | null;
  /** The second-language question against itself. */
  second_question_repeat: RunComparison | null;
  /** Run 1 against the first second-language run. */
  across_questions: RunComparison | null;
  disclaimer: string;
}

export type ConsistencyResult = { ok: true; report: ConsistencyReport; next: { id: string; leaseFree: boolean } | null } | { ok: false; status: number; error: string; message: string };

/**
 * A group's runs and their comparisons, or two scans chosen by the user (compared as run 1 and run 2,
 * or as two questions when they asked differently). Comparisons appear only once both runs finished.
 */
export async function loadConsistency(read: { ws: Read; rows: Read }, workspaceId: string, q: { groupId?: string; a?: string; b?: string }): Promise<ConsistencyResult> {
  let rows: RunRow[];
  let roles: Map<string, RunRole>;
  if (q.groupId) {
    rows = ((await read.ws<RunRow[]>("Consistency runs", (db) => db.from("scans").select(RUN_COLS).eq("workspace_id", workspaceId).like("label", `consistency:${q.groupId}:%`))) ?? [])
      .filter((r) => parseRunLabel(r.label)?.group === q.groupId);
    if (!rows.length) return { ok: false, status: 404, error: "not_found", message: "Unknown consistency check." };
    roles = new Map(rows.map((r) => [r.id, parseRunLabel(r.label)!.role]));
  } else if (q.a && q.b) {
    rows = (await read.ws<RunRow[]>("Scans", (db) => db.from("scans").select(RUN_COLS).eq("workspace_id", workspaceId).in("id", [q.a!, q.b!]))) ?? [];
    const a = rows.find((r) => r.id === q.a);
    const b = rows.find((r) => r.id === q.b);
    if (!a || !b) return { ok: false, status: 404, error: "not_found", message: "Unknown scan." };
    if (a.kind !== "ai" || b.kind !== "ai" || a.business_id !== b.business_id) return { ok: false, status: 400, error: "not_comparable", message: "Both scans must be AI scans of the same business." };
    if (a.grid_size !== b.grid_size || !samePlace(a, b)) return { ok: false, status: 400, error: "not_comparable", message: "Both scans must use the same grid (size, centre and radius), so their points are the same places." };
    const sameQuestion = (a.prompt_template ?? DEFAULT_PROMPT_TEMPLATE) === (b.prompt_template ?? DEFAULT_PROMPT_TEMPLATE) && (a.niche ?? a.keyword) === (b.niche ?? b.keyword);
    rows = [a, b];
    roles = new Map([[a.id, "A1"], [b.id, sameQuestion ? "A2" : "B1"]]);
  } else return { ok: false, status: 400, error: "invalid_request", message: "Send group_id, or two AI scan ids a and b." };

  const ordered = [...rows].sort((x, y) => RUN_ROLES.indexOf(roles.get(x.id)!) - RUN_ROLES.indexOf(roles.get(y.id)!));
  const business = await read.ws<{ name: string }>("Business", (db) => db.from("businesses").select("name").eq("id", ordered[0].business_id).eq("workspace_id", workspaceId).maybeSingle());
  const finished = (r: RunRow) => r.status === "done" || r.status === "partial";
  const done = ordered.filter(finished);
  const samples = done.length
    ? ((await read.rows<(RunSample & { scan_id: string })[]>("AI answers", (db) => db.from("ai_samples").select("scan_id, point_idx, engine, status, mentioned, named_businesses").in("scan_id", done.map((r) => r.id)))) ?? [])
    : [];
  const of = (role: RunRole) => ordered.find((r) => roles.get(r.id) === role);
  const cmp = (x: RunRole, y: RunRole) => {
    const rx = of(x);
    const ry = of(y);
    return rx && ry && finished(rx) && finished(ry) ? compareRuns(samples.filter((s) => s.scan_id === rx.id), samples.filter((s) => s.scan_id === ry.id)) : null;
  };
  const unfinished = ordered.find((r) => r.status === "queued" || r.status === "running");
  return {
    ok: true,
    report: {
      group_id: q.groupId ?? null,
      business: business?.name ?? "the business",
      grid_size: ordered[0].grid_size,
      status: unfinished ? "running" : "done",
      runs: ordered.map((r) => ({ role: roles.get(r.id)!, scan_id: r.id, status: r.status, service: r.niche ?? r.keyword, question: questionLabel(r.prompt_template), created_at: r.created_at })),
      same_question: cmp("A1", "A2"),
      second_question_repeat: cmp("B1", "B2"),
      across_questions: cmp("A1", "B1"),
      disclaimer: CONSISTENCY_DISCLAIMER,
    },
    // The next run to work on, in order: polling continues it (never a later one) when no worker holds it.
    next: q.groupId && unfinished ? { id: unfinished.id, leaseFree: !unfinished.lease_until || new Date(unfinished.lease_until).getTime() < Date.now() } : null,
  };
}

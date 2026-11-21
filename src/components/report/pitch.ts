import { aService, fmtDay, oneLine, orList } from "./derive";
import type { ReportView } from "./types";

/**
 * The email teaser of a report: a short plain-text email that opens with the business's own
 * numbers and where named rivals beat it at the same grid points, then links the full report.
 *
 * Built only from the report view, the same numbers the report page, PDF and images show. A line
 * whose data is missing is left out and listed in `omitted`; nothing is estimated or filled in.
 * RankbyAI never sends it: the agency copies it into its own mail client.
 */

export type PitchLine = "ai" | "rivals" | "maps" | "audit" | "report_link";

export interface PitchComparison {
  /** What is counted: grid points where AI named the business, or points in the Google Maps top 3. */
  metric: "ai_points" | "maps_top3_points";
  /** Grid points counted (the same for every row). */
  of: number;
  you: { name: string; value: number };
  /** Rivals counted ahead of the business at the same points, most first (at most 2). */
  rivals: { name: string; value: number }[];
}

export interface PitchAsset {
  subject: string | null;
  lines: string[];
  text: string;
  /** Lines left out, and why, so a caller can say what is missing instead of guessing. */
  omitted: { line: PitchLine; reason: string }[];
  comparison: PitchComparison | null;
}

const MAX_RIVALS = 2;

const quoted = (s: string | null) => (s ? `“${oneLine(s, 80)}”` : "its main search");

/** "Ana was named at 7 of the same 9 spots", "Ana at 7 and Bo at 5 of the same 9 spots". */
function rivalLine(rivals: { name: string; value: number }[], of: number, verb: string): string {
  const parts = rivals.map((r, i) => (i === 0 ? `${r.name} ${verb} ${r.value}` : `${r.name} at ${r.value}`));
  return `${orList(parts, "and")} of the same ${of} spots.`;
}

/** The rivals named at more grid points than the business, from the report's own count. */
function aiComparison(view: ReportView, name: string): PitchComparison | null {
  const ai = view.ai;
  if (!ai || ai.n === 1 || ai.pointsChecked === 0) return null;
  const you = ai.recommended.find((r) => r.you)?.points ?? ai.pointsMentioned;
  const rivals = ai.recommended.filter((r) => !r.you && r.points > you).slice(0, MAX_RIVALS).map((r) => ({ name: oneLine(r.name, 80), value: r.points }));
  return { metric: "ai_points", of: ai.pointsChecked, you: { name, value: you }, rivals };
}

function mapsComparison(view: ReportView, name: string): PitchComparison | null {
  const maps = view.maps;
  if (!maps || maps.single || maps.pointsDone === 0) return null;
  const rivals = maps.competitors.filter((c) => c.top3Points > maps.top3Points).slice(0, MAX_RIVALS).map((c) => ({ name: oneLine(c.name, 80), value: c.top3Points }));
  return { metric: "maps_top3_points", of: maps.pointsDone, you: { name, value: maps.top3Points }, rivals };
}

/**
 * `reportUrl` is the live report address (custom domain included), or null when the caller has
 * none: the link line is then omitted. The email is signed with the agency name when branding has one.
 */
export function pitchAsset(view: ReportView, reportUrl: string | null): PitchAsset {
  const name = oneLine(view.business.name, 120);
  const city = oneLine(view.business.city, 60);
  const around = city ? `around ${city}` : "around the business";
  const lines: string[] = [];
  const omitted: PitchAsset["omitted"] = [];
  const { ai, maps, audit } = view;

  // 1. The business's own AI numbers, dated: an answer is an observation from a day.
  const engines = ai ? orList(ai.engines.filter((e) => e.available).map((e) => e.label), "and") : "";
  const asked = ai?.service ? aService(oneLine(ai.service, 60)) : "a recommendation";
  let subject: string | null = null;
  if (ai && ai.n === 1 && ai.single) {
    const answered = ai.single.filter((s) => s.available);
    if (answered.length) {
      const named = answered.filter((s) => s.mentioned).length;
      lines.push(`On ${fmtDay(ai.date, "short")} I asked ${engines || "AI assistants"} for ${asked} at ${name}'s location. ${named} of ${answered.length} named ${name}.`);
      subject = `${name}: named by ${named} of ${answered.length} AI assistants`;
    } else omitted.push({ line: "ai", reason: "The AI check has no completed answers." });
  } else if (ai && ai.pointsChecked > 0) {
    lines.push(`On ${fmtDay(ai.date, "short")} I asked ${engines || "AI assistants"} for ${asked} from ${ai.pointsChecked} spots ${around}. They named ${name} at ${ai.pointsMentioned} of them.`);
    subject = `${name}: named by AI at ${ai.pointsMentioned} of ${ai.pointsChecked} spots ${around}`;
  } else omitted.push({ line: "ai", reason: ai ? "The AI scan has no completed answers." : "The report has no AI scan." });

  // 2. Google Maps, when the report has a grid (a one-point check says its rank instead).
  let mapsLine: string | null = null;
  if (maps?.single) {
    const r = maps.single.rank;
    mapsLine = r != null && r <= 20 ? `On Google Maps it ranks #${r} for ${quoted(maps.keyword)} at its location.` : `On Google Maps it is not in the top 20 for ${quoted(maps.keyword)} at its location.`;
  } else if (maps && maps.pointsDone > 0) {
    mapsLine = `On Google Maps, ${name} is in the top 3 for ${quoted(maps.keyword)} at ${maps.top3Points} of ${maps.pointsDone} spots${lines.length ? "" : ` ${around}`}.`;
    subject ??= `${name}: Google Maps top 3 at ${maps.top3Points} of ${maps.pointsDone} spots ${around}`;
  } else omitted.push({ line: "maps", reason: "The report has no Google Maps scan." });

  // 3. Where named rivals beat it at the same points: AI first, else Google Maps. The business's own
  // number always comes first, so without an AI line the Maps line leads.
  const aiCmp = aiComparison(view, name);
  const mapsCmp = mapsComparison(view, name);
  let comparison: PitchComparison | null = null;
  let rivals: string | null = null;
  if (aiCmp?.rivals.length) {
    rivals = rivalLine(aiCmp.rivals, aiCmp.of, "was named at");
    comparison = aiCmp;
  } else if (mapsCmp?.rivals.length) {
    rivals = rivalLine(mapsCmp.rivals, mapsCmp.of, "is in the Google Maps top 3 at");
    comparison = mapsCmp;
  } else {
    omitted.push({ line: "rivals", reason: aiCmp || mapsCmp ? "No rival was ahead of the business at the same points." : "The report has no grid to compare rivals on." });
    comparison = aiCmp ?? mapsCmp;
  }
  if (lines.length) lines.push(...[rivals, mapsLine].filter((l): l is string => !!l));
  else lines.push(...[mapsLine, rivals].filter((l): l is string => !!l));

  if (audit) lines.push(`Its Google profile and website score ${audit.score} out of 100 on our local AI audit.`);
  else omitted.push({ line: "audit", reason: "The report has no finished audit." });

  if (reportUrl) lines.push(`The map, the answers and what to fix are in a short report: ${reportUrl}`);
  else omitted.push({ line: "report_link", reason: "No report link was given." });

  if (ai && (ai.pointsChecked > 0 || ai.single?.some((s) => s.available))) lines.push("AI answers vary between runs and places, so this is a snapshot, not a fixed ranking.");
  if (lines.length) lines.push("Happy to walk you through it if it is useful.");
  if (view.brand.name) lines.push(`— ${oneLine(view.brand.name, 80)}`);

  return { subject, lines, text: lines.join("\n"), omitted, comparison };
}

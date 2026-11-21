import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VARIANTS } from "@/app/dev/report-preview/fixtures";
import { fmtDay } from "@/components/report/derive";
import { pitchAsset } from "@/components/report/pitch";
import type { ReportView } from "@/components/report/types";

const URL_ = "https://reports.agency.example/r/abcdefghijkl";
const numbers = (s: string) => (s.match(/\d+/g) ?? []).map(Number);

/** Every figure the email may state: counts from the view, the dates it prints, and the report link. */
function allowedNumbers(view: ReportView, url: string): Set<number> {
  const xs: number[] = [];
  if (view.ai) {
    xs.push(view.ai.pointsChecked, view.ai.pointsMentioned, ...view.ai.recommended.map((r) => r.points));
    xs.push(...numbers(fmtDay(view.ai.date, "short")));
    if (view.ai.single) xs.push(view.ai.single.filter((s) => s.available).length, view.ai.single.filter((s) => s.available && s.mentioned).length);
  }
  if (view.maps) {
    xs.push(view.maps.pointsDone, view.maps.top3Points, ...view.maps.competitors.map((c) => c.top3Points), 3, 20);
    if (view.maps.single?.rank != null) xs.push(view.maps.single.rank);
  }
  if (view.audit) xs.push(view.audit.score, 100);
  xs.push(...numbers(url));
  return new Set(xs);
}

/** The text with the names taken out (business and rival names may contain digits). */
const withoutNames = (text: string, view: ReportView) =>
  [view.business.name, ...(view.ai?.recommended.map((r) => r.name) ?? []), ...(view.maps?.competitors.map((c) => c.name) ?? []), view.brand.name ?? "\u0000"]
    .sort((a, b) => b.length - a.length)
    .reduce((t, n) => t.split(n).join(" "), text);

describe("email teaser (pitchAsset)", () => {
  const full = VARIANTS.full.build();

  it("opens with the business's own AI numbers, dated, then the rivals ahead of it at the same points", () => {
    const a = pitchAsset(full, URL_);
    const ai = full.ai!;
    expect(a.lines[0]).toBe(`On ${fmtDay(ai.date, "short")} I asked ChatGPT, Perplexity and Gemini for a dentist from ${ai.pointsChecked} spots around Austin. They named ${full.business.name} at ${ai.pointsMentioned} of them.`);
    const you = ai.recommended.find((r) => r.you)!.points;
    const ahead = ai.recommended.filter((r) => !r.you && r.points > you).slice(0, 2);
    expect(ahead.length).toBeGreaterThan(0);
    expect(a.lines[1]).toContain(`${ahead[0].name} was named at ${ahead[0].points}`);
    expect(a.lines[1]).toContain(`of the same ${ai.pointsChecked} spots.`);
    expect(a.comparison).toEqual({ metric: "ai_points", of: ai.pointsChecked, you: { name: full.business.name, value: you }, rivals: ahead.map((r) => ({ name: r.name, value: r.points })) });
    expect(a.text).toContain(`at ${full.maps!.top3Points} of ${full.maps!.pointsDone} spots`);
    expect(a.text).toContain(`score ${full.audit!.score} out of 100`);
    expect(a.text).toContain(URL_);
    expect(a.subject).toBe(`${full.business.name}: named by AI at ${ai.pointsMentioned} of ${ai.pointsChecked} spots around Austin`);
    expect(a.lines.length).toBeGreaterThanOrEqual(4);
    expect(a.lines.length).toBeLessThanOrEqual(8);
    expect(a.omitted).toEqual([]);
  });

  it("is 4 to 8 lines whenever the report has numbers", () => {
    for (const [key, v] of Object.entries(VARIANTS)) {
      const n = pitchAsset(v.build(), URL_).lines.length;
      expect(n, key).toBeGreaterThanOrEqual(4);
      expect(n, key).toBeLessThanOrEqual(8);
    }
  });

  it("states no number that is not in the report", () => {
    for (const [key, v] of Object.entries(VARIANTS)) {
      const view = v.build();
      const a = pitchAsset(view, URL_);
      const allowed = allowedNumbers(view, URL_);
      for (const n of numbers(withoutNames(`${a.subject ?? ""} ${a.text}`, view))) expect(allowed.has(n), `${key}: ${n} in “${a.text}”`).toBe(true);
    }
  });

  it("leaves a line out, and says why, when the report has no data for it", () => {
    const mapsOnly = pitchAsset(VARIANTS["maps-only"].build(), URL_);
    expect(mapsOnly.omitted.map((o) => o.line)).toEqual(expect.arrayContaining(["ai", "audit"]));
    expect(mapsOnly.text).not.toMatch(/AI assistants|asked ChatGPT|AI answers vary/);
    expect(mapsOnly.lines[0]).toMatch(/^On Google Maps, Pecan Row Dentistry is in the top 3 for “dentist” at \d+ of \d+ spots around Austin\.$/);
    expect(mapsOnly.lines[1]).toContain("is in the Google Maps top 3 at");

    const empty: ReportView = { ...full, ai: null, maps: null, audit: null };
    const none = pitchAsset(empty, null);
    expect(none.lines).toEqual([]);
    expect(none.subject).toBeNull();
    expect(none.comparison).toBeNull();
    expect(none.omitted.map((o) => o.line).sort()).toEqual(["ai", "audit", "maps", "report_link", "rivals"]);
  });

  it("never names a rival that is not ahead, and never makes one up", () => {
    const ai = full.ai!;
    const leading: ReportView = { ...full, maps: null, ai: { ...ai, recommended: ai.recommended.map((r) => ({ ...r, points: r.you ? ai.pointsChecked : Math.min(r.points, ai.pointsChecked - 1) })) } };
    const a = pitchAsset(leading, URL_);
    expect(a.omitted.some((o) => o.line === "rivals")).toBe(true);
    expect(a.text).not.toContain("of the same");
    expect(a.comparison?.rivals).toEqual([]);
  });

  it("a one-point check states its own answers and compares no rivals", () => {
    const free = VARIANTS.free.build();
    const a = pitchAsset(free, URL_);
    const answered = free.ai!.single!.filter((s) => s.available);
    expect(a.lines[0]).toContain(`${answered.filter((s) => s.mentioned).length} of ${answered.length} named`);
    expect(a.text).toContain("ranks #6");
  });

  it("white-label: signed with the agency, and never mentions RankbyAI", () => {
    const wl = VARIANTS["white-label"].build();
    const a = pitchAsset(wl, URL_);
    expect(a.lines[a.lines.length - 1]).toBe("— Brightline Local");
    for (const v of Object.values(VARIANTS)) expect(pitchAsset(v.build(), URL_).text).not.toMatch(/rankbyai/i);
  });

  it("has no way to send email: copy and download only", () => {
    const files = ["src/components/report/pitch.ts", "src/lib/prospects/pitch.ts", "src/app/api/prospects/[id]/pitch/route.ts", "src/app/r/[slug]/pitch-image/route.ts", "src/components/app/pitch-panel.tsx"];
    for (const f of files) {
      const src = readFileSync(path.resolve(import.meta.dirname, "../..", f), "utf8");
      expect(src, f).not.toMatch(/@\/lib\/email|sendEmail|nodemailer|resend|brevo|mailto:|smtp/i);
      expect(src, f).not.toMatch(/export (async )?function (POST|PUT|PATCH|DELETE)\b/);
    }
  });
});

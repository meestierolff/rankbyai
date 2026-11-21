import { describe, expect, it } from "vitest";
import { CHANGE_NOTE_DISCLAIMER, changeNote, changeNoteMarkdown, type NoteSample, type NoteScan } from "@/lib/scans/change-note";
import { comparableScans, pickPair } from "@/lib/scans/change-note-data";

const scan = (id: string, created_at: string, over: Partial<NoteScan & { tracked_query_id: string | null }> = {}): NoteScan & { tracked_query_id: string | null } => ({
  id, created_at, status: "done", niche: "dentist", keyword: null, prompt_template: null, grid_size: 3, engines: ["openai", "gemini"],
  center_lat: 30.27, center_lng: -97.74, radius_miles: 2, tracked_query_id: "tq-1", ...over,
});
const s = (point_idx: number, engine: NoteSample["engine"], you: number | null, names: string[], sources: string[] = [], status = "done"): NoteSample => ({
  point_idx, engine, status, prompt: `Who is the best dentist near point ${point_idx}?`, mentioned: status === "done" ? you != null : null, mention_position: you,
  named_businesses: [...names.map((name, i) => ({ name, position: i + 1 })), ...(you != null ? [{ name: "Northgate Family Dental", position: you, you: true }] : [])],
  sources: sources.map((url) => ({ url, title: url })),
});

// Before (10 Nov): ChatGPT names the business at points 0 and 1 (positions 2 and 3), Gemini at point 0.
// Old Rival is named before only; yelp.com is cited in an answer that named the business.
const A = scan("scan-a", "2026-11-10T09:00:00Z");
const samplesA = [
  s(0, "openai", 2, ["Smile Dental", "Old Rival"], ["https://www.yelp.com/biz/northgate", "https://oldblog.example/top-dentists"]),
  s(1, "openai", 3, ["Smile Dental"]),
  s(2, "openai", null, ["Smile Dental", "Old Rival"], ["https://oldblog.example/top-dentists"]),
  s(0, "gemini", 1, ["Smile Dental"]),
  s(1, "gemini", null, ["Smile Dental"]),
  s(2, "gemini", null, ["Smile Dental"]),
];
// After (17 Nov): ChatGPT names it at point 0 only (position 1), Gemini at all three points.
// New Rival appears; healthgrades.com is newly cited in answers naming the business; yelp.com is gone.
const B = scan("scan-b", "2026-11-17T09:00:00Z");
const samplesB = [
  s(0, "openai", 1, ["Smile Dental"], ["https://www.healthgrades.com/dentist/northgate"]),
  s(1, "openai", null, ["Smile Dental", "New Rival"]),
  s(2, "openai", null, ["Smile Dental", "New Rival"]),
  s(0, "gemini", 2, ["Smile Dental"], ["https://www.healthgrades.com/dentist/northgate"]),
  s(1, "gemini", 1, ["Smile Dental"]),
  s(2, "gemini", 3, ["Smile Dental"]),
];

describe("why it changed (change note)", () => {
  const note = changeNote("Northgate Family Dental", A, B, samplesA, samplesB);

  it("per engine: answers naming the business and the average position, before and after", () => {
    expect(note.status).toBe("ready");
    expect(note.window).toEqual({ from: A.created_at, to: B.created_at });
    const openai = note.engines.find((e) => e.engine === "openai")!;
    expect(openai.before).toEqual({ answers: 3, named: 2, mention_rate: 66.7, avg_position: 2.5 });
    expect(openai.after).toEqual({ answers: 3, named: 1, mention_rate: 33.3, avg_position: 1 });
    expect(openai.mention_rate_change).toBe(-33.4);
    expect(openai.avg_position_change).toBe(-1.5);
    const gemini = note.engines.find((e) => e.engine === "gemini")!;
    expect([gemini.before!.named, gemini.after!.named]).toEqual([1, 3]);
    expect(note.points).toEqual({ before: { named: 2, checked: 3 }, after: { named: 3, checked: 3 } });
  });

  it("businesses that appeared or disappeared, counted in answers", () => {
    expect(note.names.appeared).toEqual([{ name: "New Rival", answers_before: 0, answers_after: 2 }]);
    expect(note.names.disappeared).toEqual([{ name: "Old Rival", answers_before: 2, answers_after: 0 }]);
    expect([...note.names.appeared, ...note.names.disappeared].some((n) => n.name === "Smile Dental")).toBe(false);
  });

  it("cited sources added and removed, with the engines, URLs and a question that cited them", () => {
    expect(note.sources.added).toEqual([{ domain: "healthgrades.com", answers_before: 0, answers_after: 2, engines: ["ChatGPT", "Gemini"], with_business: 2, urls: ["https://www.healthgrades.com/dentist/northgate"], example_prompt: "Who is the best dentist near point 0?" }]);
    expect(note.sources.removed.map((r) => [r.domain, r.answers_before, r.with_business])).toEqual([["oldblog.example", 2, 1], ["yelp.com", 1, 1]]);
  });

  it("possible reasons only next to stored evidence, and the disclaimer always", () => {
    expect(note.possible_reasons.map((r) => r.evidence)).toEqual(["source_lost", "source_lost", "source_new"]);
    expect(note.possible_reasons[2].text).toBe("healthgrades.com was cited in 2 answers that named Northgate Family Dental on Nov 17, 2026, and in none on Nov 10, 2026.");
    expect(note.disclaimer).toBe(CHANGE_NOTE_DISCLAIMER);
    const withExtras = changeNote("Northgate Family Dental", A, B, samplesA, samplesB, {
      audit: { created_at: "2026-11-15T00:00:00Z", crawlerFindings: [{ title: "robots.txt blocks AI search crawlers: OAI-SearchBot", priority: "P1" }] },
      maps: { before: { created_at: "2026-11-09T00:00:00Z", avg_rank: 6.2, top3_points: 10, points_done: 49 }, after: { created_at: "2026-11-16T00:00:00Z", avg_rank: 4.1, top3_points: 18, points_done: 49 } },
    });
    expect(withExtras.possible_reasons.find((r) => r.evidence === "crawler_finding")?.text).toBe("The audit of Nov 15, 2026 found: robots.txt blocks AI search crawlers: OAI-SearchBot (P1). A crawler that cannot read the site cannot quote it.");
    expect(withExtras.possible_reasons.find((r) => r.evidence === "maps_move")?.text).toBe("On Google Maps, the business was in the top 3 at 10 of 49 points on Nov 9, 2026 and at 18 of 49 on Nov 16, 2026 (average rank 6.2 → 4.1).");
    // A crawler finding from an audit before the earlier scan explains nothing between the two.
    const stale = changeNote("Northgate Family Dental", A, B, samplesA, samplesB, { audit: { created_at: "2026-11-01T00:00:00Z", crawlerFindings: [{ title: "robots.txt blocks AI search crawlers: OAI-SearchBot", priority: "P1" }] } });
    expect(stale.possible_reasons.some((r) => r.evidence === "crawler_finding")).toBe(false);
    const unchangedMaps = changeNote("X", A, B, samplesA, samplesB, { maps: { before: { created_at: "2026-11-09T00:00:00Z", avg_rank: 5, top3_points: 3, points_done: 9 }, after: { created_at: "2026-11-16T00:00:00Z", avg_rank: 5, top3_points: 3, points_done: 9 } } });
    expect(unchangedMaps.possible_reasons.some((r) => r.evidence === "maps_move")).toBe(false);
  });

  it("a scan that has not finished gives no changes at all", () => {
    for (const late of [scan("scan-b", B.created_at, { status: "running" }), scan("scan-b", B.created_at, { status: "queued" })]) {
      const n = changeNote("Northgate Family Dental", A, late, samplesA, []);
      expect(n.status).toBe("not_ready");
      expect(n.message).toContain("is " + late.status);
      expect(n.engines).toEqual([]);
      expect(n.points).toBeNull();
      expect(n.possible_reasons).toEqual([]);
      expect(changeNoteMarkdown(n)).not.toMatch(/→/);
    }
    expect(changeNote("X", A, B, samplesA, samplesB.map((x) => ({ ...x, status: "failed" }))).status).toBe("not_ready");
  });

  it("missing citations are left out, not made up", () => {
    const strip = (xs: NoteSample[]) => xs.map((x) => ({ ...x, sources: [] }));
    const n = changeNote("Northgate Family Dental", A, B, strip(samplesA), strip(samplesB));
    expect(n.sources).toEqual({ added: [], removed: [], cited_before: 0, cited_after: 0 });
    expect(n.possible_reasons.some((r) => r.evidence.startsWith("source"))).toBe(false);
    expect(changeNoteMarkdown(n)).toContain("No cited sources were stored for these answers");
  });

  it("an engine in only one check is not compared; a different question is said out loud", () => {
    const n = changeNote("X", A, scan("scan-b", B.created_at, { engines: ["openai", "gemini", "perplexity"], prompt_template: "Ich suche: {service} in {city}" }), samplesA, [...samplesB, s(0, "perplexity", 1, [])]);
    const p = n.engines.find((e) => e.engine === "perplexity")!;
    expect(p.before).toBeNull();
    expect(p.mention_rate_change).toBeNull();
    expect(n.comparable.same_question).toBe(false);
    expect(n.comparable.notes.join(" ")).toContain("different question");
    expect(n.comparable.notes.join(" ")).toContain("different AI engines");
  });

  it("orders the scans by date whatever order they are given in", () => {
    expect(changeNote("Northgate Family Dental", B, A, samplesB, samplesA)).toEqual(note);
  });

  it("the Markdown states only numbers that are in the note", () => {
    const md = changeNoteMarkdown(note);
    const allowed = new Set<string>([...(JSON.stringify(note).match(/\d+(\.\d+)?/g) ?? []), "10", "17", "2026", "0"]);
    for (const n of md.replace(/https?:\/\/\S+/g, "").match(/\d+(\.\d+)?/g) ?? []) expect(allowed.has(n), n).toBe(true);
    expect(md).toContain("# Why it changed: Northgate Family Dental");
    expect(md).toContain("**ChatGPT:** named in 2 of 3 answers → 1 of 3 (66.7% → 33.3%, −33.4 pts); average position 2.5 → 1.");
    expect(md).toContain(CHANGE_NOTE_DISCLAIMER);
  });

  it("text from AI answers is cleaned before it reaches the note", () => {
    const hostile = [s(0, "openai", 1, ["Evil‮ Corp\u0007"], ["https://x.example/a b"])];
    const n = changeNote("Northgate\u0000 Dental", A, B, samplesA, hostile);
    expect(n.business).toBe("Northgate Dental");
    expect(n.names.appeared[0].name).toBe("Evil Corp");
  });
});

describe("default pair: the latest finished scan and the previous comparable one", () => {
  it("prefers the previous run of the same schedule, skips other questions and grids", () => {
    const newest = scan("n", "2026-11-17T00:00:00Z");
    const otherGrid = scan("g", "2026-11-16T00:00:00Z", { grid_size: 5 });
    const otherSchedule = scan("o", "2026-11-15T00:00:00Z", { tracked_query_id: "tq-2" });
    const sameSchedule = scan("s", "2026-11-10T00:00:00Z");
    expect(pickPair([newest, otherGrid, otherSchedule, sameSchedule])).toEqual({ before: sameSchedule, after: newest });
    expect(pickPair([newest, otherGrid])).toBeNull();
    expect(pickPair([newest])).toBeNull();
    expect(comparableScans(newest, scan("q", "2026-11-01T00:00:00Z", { prompt_template: "Other {service} {city}" }))).toBe(false);
    expect(comparableScans(newest, scan("c", "2026-11-01T00:00:00Z", { center_lat: 30.4 }))).toBe(false);
  });
});

describe("the in-app panel", () => {
  it("renders the note with copy and download, and the not-ready message alone", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { ChangeNotePanel } = await import("@/components/app/change-note");
    const note = changeNote("Northgate Family Dental", A, B, samplesA, samplesB);
    const html = renderToStaticMarkup(createElement(ChangeNotePanel, { note, markdown: changeNoteMarkdown(note) })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(html).toContain("ChatGPT: named in 2/3 → 1/3 answers (−33.4 pts)");
    expect(html).toContain("New healthgrades.com, in 2 answers (ChatGPT, Gemini), 2 of them naming the business");
    expect(html).toContain("Gone Old Rival, in 2 answers before");
    expect(html).toContain("Possible reasons (leads, from stored evidence)");
    expect(html).toContain("Copy the note");
    expect(html).toContain("Download .md");
    const waiting = changeNote("X", A, { ...B, status: "running" }, samplesA, []);
    expect(renderToStaticMarkup(createElement(ChangeNotePanel, { note: waiting, markdown: "" }))).toContain("is running");
  });
});

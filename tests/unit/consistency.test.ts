import { describe, expect, it } from "vitest";
import { openApiSpec } from "@/lib/api-v1/openapi";
import type { Estimate } from "@/lib/cost-guard";
import { compareRuns, isSideRun, parseRunLabel, runLabel, withoutSideRuns, type RunSample } from "@/lib/scans/consistency";
import { groupEstimate, questionLabel, runPlan, SECOND_LANGUAGES, secondTemplate } from "@/lib/scans/consistency-run";
import { pickPair } from "@/lib/scans/change-note-data";
import { DEFAULT_PROMPT_TEMPLATE, QUESTIONS } from "@/lib/scans/prompt";

const G = "0f3c2a9e-1b2c-4d5e-8f90-123456789abc";
const s = (point_idx: number, engine: RunSample["engine"], you: boolean, names: string[], status = "done"): RunSample => ({
  point_idx, engine, status, mentioned: status === "done" ? you : null,
  named_businesses: [...names.map((name) => ({ name })), ...(you ? [{ name: "Northgate Family Dental", you: true }] : [])],
});

describe("run labels: which scans are side runs", () => {
  it("round-trips a label and tells side runs from the first run", () => {
    expect(runLabel(G, "B2")).toBe(`consistency:${G}:B2`);
    expect(parseRunLabel(runLabel(G, "A2"))).toEqual({ group: G, role: "A2" });
    expect(parseRunLabel("weekly")).toBeNull();
    expect(parseRunLabel(null)).toBeNull();
    expect(isSideRun(runLabel(G, "A1"))).toBe(false);
    for (const r of ["A2", "B1", "B2"] as const) expect(isSideRun(runLabel(G, r))).toBe(true);
    expect(isSideRun(null)).toBe(false);
    const rows = [{ id: "b2", label: runLabel(G, "B2") }, { id: "a1", label: runLabel(G, "A1") }, { id: "plain", label: null }];
    expect(withoutSideRuns(rows).map((r) => r.id)).toEqual(["a1", "plain"]);
  });

  it("a side run is never the latest or previous scan of the 'why it changed' default pair", () => {
    const scan = (id: string, created_at: string, label: string | null) => ({ id, created_at, status: "done", niche: "dentist", prompt_template: null, grid_size: 3, engines: ["openai" as const], center_lat: 30, center_lng: -97, radius_miles: 2, tracked_query_id: null, label });
    const pair = pickPair([scan("a2", "2026-11-20T10:05:00Z", runLabel(G, "A2")), scan("a1", "2026-11-20T10:00:00Z", runLabel(G, "A1")), scan("old", "2026-11-13T10:00:00Z", null)]);
    expect(pair).toMatchObject({ after: { id: "a1" }, before: { id: "old" } });
  });
});

describe("stability of two runs (compareRuns)", () => {
  // Run A and run B of a 2-point grid on two engines. The business is named at 0/openai in both,
  // at 1/openai only in A, at 0/gemini in neither, at 1/gemini only in B. "Pecan Row Dentistry LLC" is the same business.
  const a = [s(0, "openai", true, ["Smile Dental", "Pecan Row Dentistry"]), s(1, "openai", true, ["Smile Dental"]), s(0, "gemini", false, ["Smile Dental", "Old Rival"]), s(1, "gemini", false, ["Hyde Park Smiles"])];
  const b = [s(0, "openai", true, ["Smile Dental", "Pecan Row Dentistry LLC"]), s(1, "openai", false, ["Smile Dental", "New Rival"]), s(0, "gemini", false, ["Smile Dental"]), s(1, "gemini", true, ["Hyde Park Smiles"])];
  const c = compareRuns(a, b);

  it("counts mention decisions both runs answered, and how many agreed", () => {
    expect(c.decisions).toEqual({ compared: 4, agreed: 2, stability_rate: 50 });
    expect(c.engines.find((e) => e.engine === "openai")).toMatchObject({ compared: 2, agreed: 1, stability_rate: 50, named_a: 2, named_b: 1 });
    expect(c.engines.find((e) => e.engine === "gemini")).toMatchObject({ compared: 2, agreed: 1, named_a: 0, named_b: 1 });
  });

  it("names in both runs, only in one, written several ways counted once", () => {
    expect(c.names.stable.map((r) => r.name)).toEqual(["Smile Dental", "Hyde Park Smiles", "Pecan Row Dentistry"]);
    expect(c.names.stable.find((r) => r.name === "Smile Dental")).toEqual({ name: "Smile Dental", answers_a: 3, answers_b: 3 });
    expect(c.names.only_a.map((r) => r.name)).toEqual(["Old Rival"]);
    expect(c.names.only_b.map((r) => r.name)).toEqual(["New Rival"]);
    expect(c.names.overlap_rate).toBe(60);
  });

  it("per point and engine: the business's own decision and the names that flipped", () => {
    const p1 = c.points.find((p) => p.idx === 1)!;
    expect(p1.engines.find((e) => e.engine === "openai")).toEqual({ engine: "openai", a: true, b: false, stable: ["Smile Dental"], only_a: [], only_b: ["New Rival"] });
  });

  it("an answer missing from either run is left out, never counted as a change", () => {
    const failed = compareRuns(a, [...b.slice(0, 3), s(1, "gemini", false, [], "failed")]);
    expect(failed.decisions.compared).toBe(3);
    expect(compareRuns(a, []).decisions).toEqual({ compared: 0, agreed: 0, stability_rate: null });
    expect(compareRuns(a, a).decisions.stability_rate).toBe(100);
  });
});

describe("planning and pricing a consistency check", () => {
  it("2 runs for a repeat or a second language once, 4 for both; 1 alone is refused upstream", () => {
    expect(runPlan(2, false)).toEqual(["A1", "A2"]);
    expect(runPlan(1, true)).toEqual(["A1", "B1"]);
    expect(runPlan(2, true)).toEqual(["A1", "A2", "B1", "B2"]);
    expect(runPlan(1, false)).toEqual(["A1"]);
  });

  it("the estimate is the number of runs × one grid's estimate, with the vendor lines repeated per run", () => {
    const single: Estimate = { points: 9, skipped: 0, totalUsd: 0.1422, highUsd: 0.2682, credits: 1, basis: "published prices", lines: [{ provider: "openai", label: "ChatGPT, 9 samples", usd: 0.1053 }, { provider: "perplexity", label: "Perplexity, 9 samples", usd: 0.0225 }, { provider: "gemini", label: "Gemini, 9 samples", usd: 0.0144 }] };
    for (const roles of [runPlan(2, false), runPlan(1, true), runPlan(2, true)]) {
      const e = groupEstimate(single, roles, "German");
      expect(e.runs).toBe(roles.length);
      expect(e.totalUsd).toBeCloseTo(single.totalUsd * roles.length, 10);
      expect(e.highUsd).toBeCloseTo(single.highUsd * roles.length, 10);
      expect(e.credits).toBe(single.credits * roles.length);
      expect(e.lines).toHaveLength(single.lines.length * roles.length);
      expect(e.lines.reduce((t, l) => t + l.usd, 0)).toBeCloseTo(e.totalUsd, 10);
      expect(new Set(e.lines.map((l) => l.provider))).toEqual(new Set(["openai", "perplexity", "gemini"]));
    }
    expect(groupEstimate(single, runPlan(2, true), "German").lines.map((l) => l.label)).toContain("Run 3: the question in German: ChatGPT, 9 samples");
  });

  it("the second question is RankbyAI's written one, or the user's own; nothing is translated", () => {
    expect(secondTemplate({ language: "de", keyword: "Zahnarzt" })).toEqual({ template: QUESTIONS.de.template });
    expect(secondTemplate({ language: "en", keyword: "dentist" })).toEqual({ template: DEFAULT_PROMPT_TEMPLATE });
    expect(secondTemplate({ promptTemplate: "Wer ist der beste {service} in {city}?", keyword: "Zahnarzt" })).toEqual({ template: "Wer ist der beste {service} in {city}?" });
    expect("error" in secondTemplate({ language: "xx", keyword: "x" })).toBe(true);
    expect("error" in secondTemplate({ promptTemplate: "no placeholders", keyword: "x" })).toBe(true);
    expect(questionLabel(null)).toBe("English");
    expect(questionLabel(QUESTIONS.nl.template)).toBe("Dutch");
    expect(questionLabel("Who is the best {service} in {city}?")).toBe("a custom question");
  });

  it("the API reference lists exactly the languages the server accepts", () => {
    const post = (openApiSpec("https://rankbyai.live").paths["/scans/consistency"] as { post: { requestBody: { content: { "application/json": { schema: { properties: { second_language: { properties: { language: { enum: string[] } } } } } } } } } }).post;
    expect(post.requestBody.content["application/json"].schema.properties.second_language.properties.language.enum).toEqual([...SECOND_LANGUAGES]);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { admin, closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";
import { numbersIn, type CheckResult, type Evidence } from "@/lib/audit/checks";
import { generateFixKit } from "@/lib/audit/fixkit";
import { pagePlan, pagePlanCsv, reviewTarget } from "@/lib/audit/math";
import { createAudit, failStalledAudits, processAudit, type StoredAuditInputs } from "@/lib/audit/run";

/**
 * M4 acceptance against the real local database with SIMULATED vendors (RANKBYAI_MOCK_PROVIDERS=1).
 * The fixtures go through the real HTML parser, checks and scoring; only the vendor HTTP calls are simulated.
 */
let u: TestUser;
let other: TestUser;
let businessId: string;

const base = (over: Record<string, unknown> = {}) => ({ workspaceId: u.workspaceId, plan: "lifetime" as const, businessId, service: "dentist", months: 3, funding: "byok" as const, confirm: true, ...over });

async function runAudit(over: Record<string, unknown> = {}) {
  const r = await createAudit(base(over));
  if (!r.ok) throw new Error("create failed: " + JSON.stringify(r));
  await processAudit(r.auditId);
  const [audit] = await sql<{ id: string; status: string; score: number; category_scores: Record<string, { score: number | null; ran: number; total: number }>; checks_ran: number; checks_total: number; inputs: StoredAuditInputs; error: string | null; scan_ids: string[]; cost_usd: string }>(
    "select * from public.audits where id = $1", [r.auditId]);
  const findings = await sql<{ priority: string; category: string; title: string; evidence: Evidence[]; fix: string; check_key: string; data: Record<string, unknown> }>(
    "select * from public.audit_findings where audit_id = $1 order by priority", [r.auditId]);
  return { audit, findings, estimate: r.estimate };
}

beforeAll(async () => {
  process.env.RANKBYAI_MOCK_PROVIDERS = "1";
  delete process.env.VERCEL;
  await resetData();
  u = await createTestUser("auditor");
  other = await createTestUser("outsider");
});
beforeEach(async () => {
  await resetData();
  await sql("update public.workspaces set plan = 'lifetime', lifetime_seat = 1 where id = $1", [u.workspaceId]);
  const { data, error } = await admin.from("businesses").insert({
    workspace_id: u.workspaceId, name: "Northgate Family Dental", city: "Austin", region: "Texas", country: "US", address: "4100 Mock Lamar Blvd, Austin, TX 78756",
    lat: 30.3172, lng: -97.7231, cid: "mock-cid-target", website: "https://northgatefamilydental.example", phone: "+1 512 555 0174", primary_category: "Dental clinic",
  }).select("id").single();
  if (error) throw error;
  businessId = data.id;
});
afterAll(async () => {
  delete process.env.RANKBYAI_MOCK_PROVIDERS;
  await resetData();
  await deleteTestUsers();
  await closePool();
});

describe("estimate before running", () => {
  it("returns the estimate and creates nothing until confirmed", async () => {
    const r = await createAudit(base({ confirm: false }));
    expect(r).toMatchObject({ ok: false, status: 409, error: "confirmation_required" });
    if (r.ok) return;
    expect(r.estimate?.runsMapsCheck).toBe(true); // no scans yet: the audit will look both up itself
    expect(r.estimate?.runsAiCheck).toBe(true);
    expect(r.estimate!.totalUsd).toBeGreaterThan(0.02);
    expect(r.estimate!.totalUsd).toBeLessThan(0.1); // brief 7.4: roughly $0.03–0.06
    expect(r.estimate!.totalUsd).toBeCloseTo(r.estimate!.lines.reduce((s, l) => s + l.usd, 0), 6);
    expect(await sql("select 1 from public.audits")).toEqual([]);
  });

  it("needs lifetime access and a business in this workspace", async () => {
    expect(await createAudit(base({ plan: "locked" }))).toMatchObject({ ok: false, status: 403, error: "lifetime_required" });
    expect(await createAudit(base({ workspaceId: other.workspaceId }))).toMatchObject({ ok: false, status: 404 });
    expect(await createAudit(base({ service: "x" }))).toMatchObject({ ok: false, status: 400, error: "invalid_service" });
    expect(await createAudit(base({ months: 13 }))).toMatchObject({ ok: false, status: 400, error: "invalid_months" });
  });
});

describe("audit result (acceptance)", () => {
  it("returns a score, six category scores and the share of checks that ran", async () => {
    const { audit } = await runAudit();
    expect(audit.status).toBe("done");
    expect(audit.score).toBeGreaterThanOrEqual(0);
    expect(audit.score).toBeLessThanOrEqual(100);
    expect(Object.keys(audit.category_scores).sort()).toEqual(["ai_presence", "competitive", "identity", "profile", "reviews", "website"]);
    expect(audit.checks_total).toBe(audit.inputs.checks.length);
    expect(audit.checks_ran).toBe(audit.inputs.checks.filter((c) => c.status !== "not_checked").length);
    expect(audit.checks_ran).toBeGreaterThan(10);
    expect(audit.checks_ran).toBeLessThanOrEqual(audit.checks_total);
    // The score is the weighted share of passed checks among the ones that ran.
    for (const [cat, s] of Object.entries(audit.category_scores)) {
      const ran = audit.inputs.checks.filter((c) => c.category === cat && c.status !== "not_checked");
      expect(s.ran, cat).toBe(ran.length);
      if (ran.length) expect(s.score, cat).toBe(Math.round((ran.filter((c) => c.status === "pass").length / ran.length) * 100));
      else expect(s.score, cat).toBeNull();
    }
    expect(audit.scan_ids).toHaveLength(1); // the 1×1 AI check it ran
  });

  it("stores a finding only for a failed check, each with evidence, a fix and a P0–P3 priority", async () => {
    const { audit, findings } = await runAudit();
    const failed = audit.inputs.checks.filter((c) => c.status === "fail");
    expect(findings.map((f) => f.check_key).sort()).toEqual(failed.map((c) => c.key).sort());
    expect(findings.length).toBeGreaterThan(4);
    for (const f of findings) {
      expect(["P0", "P1", "P2", "P3"]).toContain(f.priority);
      expect(f.evidence.length, f.check_key).toBeGreaterThan(0);
      expect(f.evidence.every((e) => e.label && e.value !== undefined), f.check_key).toBe(true);
      expect(f.fix.length, f.check_key).toBeGreaterThan(0);
    }
    // The fixture has a phone mismatch (P0), a review gap (P1), no schema (P2).
    expect(findings.find((f) => f.check_key === "nap_phone")?.priority).toBe("P0");
    expect(findings.find((f) => f.check_key === "review_gap")?.priority).toBe("P1");
    expect(findings.find((f) => f.check_key === "schema_localbusiness")?.priority).toBe("P2");
    // Checks that could not run say why, and are not findings.
    for (const c of audit.inputs.checks.filter((x) => x.status === "not_checked")) {
      expect(c.reason, c.key).toBeTruthy();
      expect(findings.some((f) => f.check_key === c.key)).toBe(false);
    }
  });

  it("review maths matches a hand calculation", async () => {
    const { findings } = await runAudit();
    const f = findings.find((x) => x.check_key === "review_gap")!;
    // By hand: you 38; competitors 96, 112, 205 → median 112; gap 112 − 38 = 74; 74 ÷ 3 months = 24.67 → 25 a month.
    expect(f.data).toMatchObject({ you: 38, top3Median: 112, top3Max: 205, gap: 74, months: 3, monthlyTarget: 25 });
    expect(f.title).toBe("38 reviews vs a map-pack median of 112");
    expect(f.evidence.find((e) => e.label === "Monthly target")?.value).toBe("74 ÷ 3 months = 25 reviews/month");
    expect(reviewTarget(38, [96, 112, 205], 3)?.monthlyTarget).toBe(25);
    // Another period, by hand: 74 ÷ 6 = 12.33 → 13.
    const six = await runAudit({ months: 6 });
    expect(six.findings.find((x) => x.check_key === "review_gap")!.data).toMatchObject({ gap: 74, months: 6, monthlyTarget: 13 });
  });

  it("the service gap cites a competitor URL for every missing service", async () => {
    const { audit, findings } = await runAudit();
    const f = findings.find((x) => x.check_key === "service_pages")!;
    const missing = f.data.missing as { service: string; competitor: string; url: string }[];
    expect(missing.map((m) => m.service.toLowerCase()).sort()).toEqual(["dental implants", "emergency dentist", "invisalign", "teeth whitening"]);
    const competitorSites = audit.inputs.competitors.map((c) => c.website).filter(Boolean) as string[];
    expect(competitorSites).toHaveLength(3);
    for (const m of missing) {
      expect(competitorSites.some((site) => m.url.startsWith(site)), m.url).toBe(true);
      expect(audit.inputs.competitors.map((c) => c.name)).toContain(m.competitor);
      expect(f.evidence.some((e) => e.source_url === m.url), m.service).toBe(true);
    }
    expect(f.fix).toBe("Build a page for each service you actually offer.");
  });

  it("page maths: services × areas, and the CSV lists every pair", async () => {
    const { audit, findings } = await runAudit();
    const plan = audit.inputs.pagePlan!;
    expect(plan.services).toHaveLength(6); // 2 of its own + 4 that competitors have
    expect(plan.areas).toEqual(["Hyde Park", "North Loop", "Rosedale", "Brentwood"]);
    const f = findings.find((x) => x.check_key === "page_math")!;
    expect(f.title).toBe("6 services × 4 areas = 24 pages; the site has 1");
    expect(f.data).toMatchObject({ pagesNeeded: 24, pagesHave: 1, toBuild: 23 });
    const csv = pagePlanCsv(pagePlan(plan.services, plan.areas, "Northgate Family Dental"));
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("service,area,suggested_slug,suggested_title");
    expect(lines).toHaveLength(25);
    expect(lines.some((l) => l.includes('"/invisalign-hyde-park"') && l.includes('"Invisalign in Hyde Park | Northgate Family Dental"'))).toBe(true);
  });

  it("no finding contains a number that is not in its evidence", async () => {
    const { findings } = await runAudit();
    for (const f of findings) {
      const evidenceNumbers = new Set(numbersIn(f.evidence.map((e) => `${e.label} ${e.value}`).join(" ")));
      for (const n of numbersIn(`${f.title} ${f.fix}`)) expect(evidenceNumbers.has(n), `${f.check_key}: “${n}” in “${f.title} / ${f.fix}”`).toBe(true);
    }
  });

  it("AI presence comes from stored answers: engines, who was named instead, shared sources", async () => {
    const { audit } = await runAudit();
    const ai = audit.inputs.ai!;
    expect(ai.engines.map((e) => e.engine)).toEqual(["openai", "perplexity", "gemini"]);
    expect(ai.engines.every((e) => e.done === 1)).toBe(true);
    const [samples] = await sql<{ n: number }>("select count(*)::int as n from public.ai_samples where scan_id = $1", [audit.scan_ids[0]]);
    expect(samples.n).toBe(3);
    const check = audit.inputs.checks.find((c: CheckResult) => c.key === "ai_mentions")!;
    expect(check.status).not.toBe("not_checked");
    expect(check.evidence.find((e) => e.label === "Engines checked")?.value).toBe("3");
  });

  it("reuses the latest scans instead of paying for new lookups", async () => {
    await runAudit(); // leaves a 1×1 AI scan behind
    const r = await createAudit(base({ confirm: false }));
    if (r.ok) throw new Error("expected an estimate");
    expect(r.estimate?.runsAiCheck).toBe(false);
    const second = await runAudit();
    expect((await sql<{ n: number }>("select count(*)::int as n from public.scans"))[0].n).toBe(1);
    expect(second.audit.status).toBe("done");
  });
});

describe("funding and failure", () => {
  it("an included-scan audit takes exactly one credit, also for its own AI check", async () => {
    expect(await createAudit(base({ funding: "credits" }))).toMatchObject({ ok: false, status: 402, error: "insufficient_credits" });
    expect(await sql("select 1 from public.audits")).toEqual([]);
    await sql("insert into public.credit_ledger (workspace_id, delta, reason) values ($1, 3, 'pack')", [u.workspaceId]);
    const { audit } = await runAudit({ funding: "credits" });
    expect(audit.status).toBe("done");
    expect((await admin.rpc("credit_balance", { p_workspace_id: u.workspaceId })).data).toBe(2);
    expect((await sql<{ credits_used: number; funding: string }>("select credits_used, funding from public.scans"))[0]).toEqual({ credits_used: 0, funding: "credits" });
  });

  it("a failed audit gives the credit back, once", async () => {
    await sql("insert into public.credit_ledger (workspace_id, delta, reason) values ($1, 1, 'pack')", [u.workspaceId]);
    const r = await createAudit(base({ funding: "credits" }));
    if (!r.ok) throw new Error("create failed");
    expect((await admin.rpc("credit_balance", { p_workspace_id: u.workspaceId })).data).toBe(0);
    await sql("update public.audits set created_at = now() - interval '20 minutes' where id = $1", [r.auditId]); // its worker died
    expect(await failStalledAudits()).toBe(1);
    expect(await failStalledAudits()).toBe(0);
    expect((await sql<{ status: string }>("select status from public.audits where id = $1", [r.auditId]))[0].status).toBe("failed");
    expect((await admin.rpc("credit_balance", { p_workspace_id: u.workspaceId })).data).toBe(1);
    await processAudit(r.auditId); // a late worker does nothing
    expect((await admin.rpc("credit_balance", { p_workspace_id: u.workspaceId })).data).toBe(1);
  });

  it("two workers on the same audit produce one result", async () => {
    const r = await createAudit(base());
    if (!r.ok) throw new Error("create failed");
    await Promise.all([processAudit(r.auditId), processAudit(r.auditId)]);
    const keys = (await sql<{ check_key: string }>("select check_key from public.audit_findings where audit_id = $1", [r.auditId])).map((x) => x.check_key);
    expect(new Set(keys).size).toBe(keys.length);
    expect((await sql<{ n: number }>("select count(*)::int as n from public.scans"))[0].n).toBe(1);
  });

  it("another workspace cannot read the audit, its findings or its Fix Kit", async () => {
    const { audit } = await runAudit();
    await generateFixKit(audit.id, u.workspaceId);
    for (const table of ["audits", "audit_findings", "fix_kits"]) {
      expect((await other.client.from(table).select("*")).data ?? [], table).toEqual([]);
      expect(((await u.client.from(table).select("*")).data ?? []).length, table).toBeGreaterThan(0);
    }
    expect(await generateFixKit(audit.id, other.workspaceId)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("Fix Kit", () => {
  it("builds schema, FAQs, llms.txt and a checklist from the audit", async () => {
    const { audit } = await runAudit();
    const r = await generateFixKit(audit.id, u.workspaceId);
    if (!r.ok) throw new Error("fix kit failed: " + r.message);
    const kit = r.kit;
    expect(kit.description!.length).toBeLessThanOrEqual(750);
    expect(kit.faqs).toHaveLength(8);

    // LocalBusiness: the right subtype, and name, address and phone from the Google profile.
    expect(kit.jsonld_localbusiness).toMatchObject({
      "@context": "https://schema.org", "@type": "Dentist", name: "Northgate Family Dental", telephone: "+1 512 555 0174", url: "https://northgatefamilydental.example",
      address: { "@type": "PostalAddress", streetAddress: "4100 Mock Lamar Blvd", addressLocality: "Austin", addressRegion: "Texas", postalCode: "78756", addressCountry: "US" },
      geo: { "@type": "GeoCoordinates", latitude: 30.3172, longitude: -97.7231 },
    });
    expect(JSON.stringify(kit.jsonld_localbusiness)).not.toMatch(/aggregateRating|openingHours|null/);

    // FAQPage: the same questions and answers as the visible FAQ.
    const faq = kit.jsonld_faq as { "@type": string; mainEntity: { "@type": string; name: string; acceptedAnswer: { "@type": string; text: string } }[] };
    expect(faq["@type"]).toBe("FAQPage");
    expect(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(kit.faqs.map((f) => [f.question, f.answer]));
    expect(faq.mainEntity.every((q) => q["@type"] === "Question" && q.acceptedAnswer["@type"] === "Answer")).toBe(true);

    expect(kit.llms_txt).toMatch(/^# Northgate Family Dental\n/);
    expect(kit.llms_txt).toContain("- Phone: +1 512 555 0174");
    expect(kit.llms_txt).toContain("(https://northgatefamilydental.example/services/teeth-cleaning)");

    const groups = new Set(kit.checklist.map((c) => c.group));
    // No "Get listed" items here: every engine named the business, so there is no source gap to report.
    expect([...groups].sort()).toEqual(["Google profile", "Pages to build", "Website"]);
    expect(kit.checklist.filter((c) => c.group === "Pages to build")).toHaveLength(10);
  });

  it("is generated once; an own-key audit can regenerate it", async () => {
    const { audit } = await runAudit();
    const first = await generateFixKit(audit.id, u.workspaceId);
    const again = await generateFixKit(audit.id, u.workspaceId);
    const fresh = await generateFixKit(audit.id, u.workspaceId, true);
    if (!first.ok || !again.ok || !fresh.ok) throw new Error("fix kit failed");
    expect(again.kit.id).toBe(first.kit.id);
    expect(fresh.kit.id).not.toBe(first.kit.id);
    expect((await sql<{ n: number }>("select count(*)::int as n from public.fix_kits"))[0].n).toBe(1);
  });

  it("needs a finished audit", async () => {
    const r = await createAudit(base());
    if (!r.ok) throw new Error("create failed");
    expect(await generateFixKit(r.auditId, u.workspaceId)).toMatchObject({ ok: false, status: 409, error: "audit_not_done" });
  });
});

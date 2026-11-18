import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The app's own API routes, without a database.
 *
 * On production the gateway sometimes drops the signed-in identity. A route that ignored the read
 * error then answered "not found" or an empty list over real data. These tests pin down three rules:
 *   1. A read that is refused for the signed-in user is read again as the server, and EVERY query
 *      that reaches the server role is filtered by the workspace of the verified session.
 *   2. A read that fails on both paths answers 503, never 404 and never an empty 200.
 *   3. A write never moves to the server role, and a failed write is never reported as success.
 */
const WS = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const SLUG = "abcdefghijkl";

type Filter = [column: string, value: unknown];
interface Call {
  who: "user" | "server";
  table: string;
  op: "select" | "insert" | "update" | "delete" | "rpc";
  columns: string;
  filters: Filter[];
}
interface Answer { data: unknown; error: { code?: string } | null; count?: number | null }

const calls: Call[] = [];
let respond: (call: Call) => Answer = () => ({ data: null, error: null });

/** A stand-in for the PostgREST client that records which role asked for what, with which filters. */
function fakeDb(who: Call["who"]) {
  const start = (table: string, op: Call["op"]) => {
    const call: Call = { who, table, op, columns: "", filters: [] };
    calls.push(call);
    const builder = {
      select: (columns = "*") => ((call.columns = columns), builder),
      insert: () => ((call.op = "insert"), builder),
      update: () => ((call.op = "update"), builder),
      delete: () => ((call.op = "delete"), builder),
      eq: (column: string, value: unknown) => (call.filters.push([column, value]), builder),
      order: () => builder,
      limit: () => builder,
      single: () => builder,
      maybeSingle: () => builder,
      then: (resolve: (a: Answer) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(respond(call)).then(resolve, reject),
    };
    return builder;
  };
  return { from: (table: string) => start(table, "select"), rpc: (fn: string) => start(fn, "rpc") };
}
const userDb = fakeDb("user");
const serverDb = fakeDb("server");

const session = {
  ctx: { user: { id: "u1", email: "a@example.com" }, workspace: { id: WS, plan: "lifetime" }, role: "owner", isAdmin: false } as unknown,
  member: { userId: "u1", workspaceId: WS } as { userId: string; workspaceId: string } | null,
};
vi.mock("@/lib/auth", () => ({ getSessionContext: async () => session.ctx }));
vi.mock("@/lib/db/session", () => ({ currentMember: async () => session.member, currentUserDb: async () => userDb }));
vi.mock("@/lib/db/clients", () => ({ dbAdmin: () => serverDb, dbUser: () => userDb }));
vi.mock("@/lib/analytics-server", () => ({ captureServer: async () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
// Everything below does real work (providers, PDFs, zips); the routes only pass results through.
vi.mock("@/lib/scans/engine", () => ({ processScan: async () => {} }));
vi.mock("@/lib/prospects/batch", () => ({ processBatch: async () => {}, batchCsv: () => "csv" }));
vi.mock("@/lib/prospects/zip", () => ({ zipBatchPdfs: async () => ({ bytes: new Uint8Array([1]), count: 1 }) }));
vi.mock("@/lib/audit/fixkit", () => ({ generateFixKit: async () => ({ ok: false, status: 409, error: "x", message: "x" }) }));
vi.mock("@/lib/reports", () => ({ getReportView: async () => ({ kind: "share", business: { name: "Acme" } }) }));
vi.mock("@/lib/pdf/report-pdf", () => ({ pdfFileName: () => "acme.pdf", renderReportPdf: async () => new Uint8Array([1]) }));

const scan = await import("@/app/api/scans/[id]/route");
const batch = await import("@/app/api/prospects/[id]/route");
const batchCsvRoute = await import("@/app/api/prospects/[id]/export.csv/route");
const batchZip = await import("@/app/api/prospects/[id]/reports.zip/route");
const audit = await import("@/app/api/audits/[id]/route");
const auditCsv = await import("@/app/api/audits/[id]/pages.csv/route");
const fixKit = await import("@/app/api/audits/[id]/fix-kit/route");
const reportPdf = await import("@/app/api/reports/[slug]/pdf/route");
const orderStatus = await import("@/app/api/orders/status/route");
const clients = await import("@/app/api/clients/route");
const client = await import("@/app/api/clients/[id]/route");
const sharing = await import("@/app/api/workspace/regional-sharing/route");
const vote = await import("@/app/api/requests/[id]/vote/route");

const req = (body?: unknown, url = "http://localhost/api/x") => new Request(url, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });
const byId = { params: Promise.resolve({ id: ID }) };

/** Every route that reads for a signed-in member. `missing` is its honest answer when the row is not there. */
const READS: { name: string; run: () => Promise<Response>; missing: number }[] = [
  { name: "GET /api/scans/[id]", run: () => scan.GET(req(), byId), missing: 404 },
  { name: "GET /api/prospects/[id]", run: () => batch.GET(req(), byId), missing: 404 },
  { name: "GET /api/prospects/[id]/export.csv", run: () => batchCsvRoute.GET(req(), byId), missing: 404 },
  { name: "GET /api/prospects/[id]/reports.zip", run: () => batchZip.GET(req(), byId), missing: 404 },
  { name: "GET /api/audits/[id]", run: () => audit.GET(req(), byId), missing: 404 },
  { name: "GET /api/audits/[id]/pages.csv", run: () => auditCsv.GET(req(), byId), missing: 404 },
  { name: "GET /api/audits/[id]/fix-kit", run: () => fixKit.GET(req(), byId), missing: 200 },
  { name: "GET /api/reports/[slug]/pdf", run: () => reportPdf.GET(req(), { params: Promise.resolve({ slug: SLUG }) }), missing: 404 },
  { name: "GET /api/orders/status", run: () => orderStatus.GET(req(undefined, "http://localhost/api/orders/status?session_id=cs_test_1")), missing: 200 },
];

/** What the database holds for the session's workspace, by table. */
const ROWS: Record<string, Answer> = {
  scans: { data: { id: ID, kind: "ai", status: "done", lease_until: null }, error: null },
  scan_points: { data: [{ idx: 0, rank: 2, scans: { workspace_id: WS } }], error: null },
  ai_samples: { data: [{ point_idx: 0, engine: "openai", scans: { workspace_id: WS } }], error: null },
  prospect_batches: { data: { id: ID, niche: "Dentists", status: "done", lease_until: null, rows: [{ status: "done", report_slug: SLUG }] }, error: null },
  audits: { data: { id: ID, status: "done", business_id: ID, inputs: { pagePlan: { services: ["Implants"], areas: ["Leiden"] } } }, error: null },
  businesses: { data: { name: "Acme Dental" }, error: null },
  fix_kits: { data: [{ id: "kit-1" }], error: null },
  reports: { data: { id: "report-1" }, error: null },
  orders: { data: { id: "order-1", product_key: "lifetime", status: "paid", ladder_seat: 7, amount_cents: 4900 }, error: null },
  clients: { data: null, error: null, count: 3 },
};
const refused: Answer = { data: null, error: { code: "RB001" } };
const identityDropped = (call: Call): Answer => (call.who === "user" ? refused : (ROWS[call.table] ?? { data: null, error: null }));

/**
 * The query is limited to the session's workspace: by its own workspace_id, or, for a table without
 * one, by the workspace of the scan it is joined to. That join must be an inner join: without
 * `!inner` a filter on the joined table does not remove any row.
 */
const inSessionWorkspace = (call: Call) =>
  call.filters.some(([column, value]) => column === "workspace_id" && value === WS) ||
  (call.filters.some(([column, value]) => column === "scans.workspace_id" && value === WS) && call.columns.includes("scans!inner("));
const serverCalls = () => calls.filter((c) => c.who === "server");

beforeEach(() => {
  calls.length = 0;
  respond = () => ({ data: null, error: null });
  session.member = { userId: "u1", workspaceId: WS };
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("reads when the gateway drops the signed-in identity", () => {
  it.each(READS)("$name answers with the real data, read as the server inside the session's workspace only", async ({ run }) => {
    respond = identityDropped;
    const res = await run();
    expect(res.status).toBe(200);
    expect(serverCalls().length).toBeGreaterThan(0);
    for (const call of serverCalls()) {
      expect(call.op, `${call.table} as the server must be a read`).toBe("select");
      expect(inSessionWorkspace(call), `${call.table} as the server must be filtered by the session's workspace`).toBe(true);
    }
  });

  it("the signed-in read carries the same workspace filter as the server read", async () => {
    respond = identityDropped;
    for (const { run } of READS) await run();
    for (const call of calls.filter((c) => c.op === "select")) expect(inSessionWorkspace(call), `${call.table} as ${call.who}`).toBe(true);
  });

  it("a scan comes back whole, without the column that was joined in for the filter", async () => {
    respond = identityDropped;
    const body = (await (await scan.GET(req(), byId)).json()) as { scan: Record<string, unknown>; points: unknown[]; samples: unknown[] };
    expect(body.points).toEqual([{ idx: 0, rank: 2 }]);
    expect(body.samples).toEqual([{ point_idx: 0, engine: "openai" }]);
    expect(body.scan).toEqual({ id: ID, kind: "ai", status: "done" });
  });

  it("points and answers of a scan are tied to the scan AND to the workspace in the same query", async () => {
    respond = identityDropped;
    await scan.GET(req(), byId);
    for (const table of ["scan_points", "ai_samples"]) {
      const call = serverCalls().find((c) => c.table === table);
      expect(call?.filters).toEqual(expect.arrayContaining([["scan_id", ID], ["scans.workspace_id", WS]]));
      expect(call?.columns).toContain("scans!inner(workspace_id)");
    }
  });

  it("an order is only found inside the session's workspace", async () => {
    respond = identityDropped;
    const res = await orderStatus.GET(req(undefined, "http://localhost/api/orders/status?session_id=cs_test_1"));
    expect(await res.json()).toEqual({ ready: true, order: ROWS.orders.data });
    expect(serverCalls()[0].filters).toEqual(expect.arrayContaining([["stripe_checkout_session_id", "cs_test_1"], ["workspace_id", WS]]));
  });
});

describe("reads that fail on both paths", () => {
  it.each(READS)("$name answers 503, not 404 and not an empty 200", async ({ run }) => {
    respond = () => ({ data: null, error: { code: "57014" } });
    const res = await run();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "unavailable", message: "Could not load this right now. Try again." });
  });

  it("a scan whose points cannot be read is a 503, not a scan without points", async () => {
    respond = (call) => (call.table === "scans" ? ROWS.scans : { data: null, error: { code: "57014" } });
    expect((await scan.GET(req(), byId)).status).toBe(503);
  });
});

describe("reads that work", () => {
  it.each(READS)("$name: a row that is not there is still an honest answer, and the server role is never used", async ({ run, missing }) => {
    const res = await run();
    expect(res.status).toBe(missing);
    expect(serverCalls()).toEqual([]);
  });

  it("no Fix Kit yet and no order yet keep their own answers", async () => {
    respond = (call) => (call.table === "fix_kits" ? { data: [], error: null } : { data: null, error: null });
    expect(await (await fixKit.GET(req(), byId)).json()).toEqual({ kit: null });
    expect(await (await orderStatus.GET(req(undefined, "http://localhost/api/orders/status?session_id=cs_test_1"))).json()).toEqual({ ready: false });
  });
});

describe("a session that does not own the workspace", () => {
  it.each(READS)("$name runs no query at all, as either role", async ({ run }) => {
    session.member = { userId: "u1", workspaceId: "33333333-3333-4333-8333-333333333333" };
    respond = identityDropped;
    expect((await run()).status).toBe(503);
    expect(calls).toEqual([]);
  });
});

describe("writes stay with the signed-in user", () => {
  const WRITES: { name: string; run: () => Promise<Response> }[] = [
    { name: "PATCH /api/clients/[id]", run: () => client.PATCH(req({ name: "New name" }), byId) },
    { name: "DELETE /api/clients/[id]", run: () => client.DELETE(req(), byId) },
    { name: "POST /api/workspace/regional-sharing", run: () => sharing.POST(req({ enabled: true })) },
    { name: "POST /api/requests/[id]/vote", run: () => vote.POST(req(), byId) },
  ];

  it.each(WRITES)("$name: a refused write answers 503 and is never repeated as the server", async ({ run }) => {
    respond = () => refused;
    const res = await run();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "unavailable", message: "Could not save this right now. Try again." });
    expect(serverCalls()).toEqual([]);
  });

  it("a client that does not exist is still a 404 when the write itself worked", async () => {
    respond = () => ({ data: [], error: null });
    expect((await client.PATCH(req({ name: "New name" }), byId)).status).toBe(404);
    expect((await client.DELETE(req(), byId)).status).toBe(404);
  });

  it("a vote for an unknown request is a 404; a stored vote returns the count", async () => {
    respond = () => ({ data: null, error: { code: "23503" } });
    expect((await vote.POST(req(), byId)).status).toBe(404);
    respond = () => ({ data: 4, error: null });
    expect(await (await vote.POST(req(), byId)).json()).toEqual({ ok: true, votes: 4 });
  });

  it("adding a client: the count may be read as the server, the insert never is", async () => {
    respond = identityDropped;
    const res = await clients.POST(req({ name: "Acme" }));
    expect(res.status).toBe(500); // the insert was refused for the signed-in user, and that is what the user is told
    expect(serverCalls().map((c) => c.op)).toEqual(["select"]);
    expect(inSessionWorkspace(serverCalls()[0])).toBe(true);
    expect(calls.filter((c) => c.op === "insert").map((c) => c.who)).toEqual(["user"]);
  });

  it("adding a client: a count that cannot be read is a 503, not room for one more", async () => {
    respond = () => ({ data: null, error: { code: "57014" } });
    expect((await clients.POST(req({ name: "Acme" }))).status).toBe(503);
    expect(calls.filter((c) => c.op === "insert")).toEqual([]);
  });

  it("adding a client works and respects the limit of 500", async () => {
    respond = (call) => (call.op === "insert" ? { data: { id: "client-1" }, error: null } : { data: null, error: null, count: 3 });
    expect(await (await clients.POST(req({ name: "Acme" }))).json()).toEqual({ ok: true, id: "client-1" });
    respond = () => ({ data: null, error: null, count: 500 });
    expect((await clients.POST(req({ name: "Acme" }))).status).toBe(409);
  });
});

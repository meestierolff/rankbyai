import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/clients", () => ({ dbAdmin: () => { throw new Error("no database in unit tests"); } }));

const { gateAuthRequest, parseReviewerEmails, REFUSAL_FLOOR_MS } = await import("@/lib/reviewer-login");
type Deps = Parameters<typeof gateAuthRequest>[3] & object;

const REVIEWER = "review@rankbyai.live";

function deps(over: Partial<Deps> = {}): Deps & { slept: number[]; keys: string[] } {
  const slept: number[] = [];
  const keys: string[] = [];
  return {
    emails: () => new Set([REVIEWER]),
    hit: async (key) => { keys.push(key); return true; },
    sleep: async (ms) => { slept.push(ms); },
    now: () => 1_000,
    ...over,
    slept,
    keys,
  };
}

const signIn = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://rankbyai.live/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("parseReviewerEmails", () => {
  it("keeps exact addresses, lower-cased, and drops everything else", () => {
    expect([...parseReviewerEmails(" Review@RankbyAI.live , *@rankbyai.live, rankbyai.live, a@b.co;c@d.co ,, x@y.io")]).toEqual([REVIEWER, "x@y.io"]);
  });
  it("is empty (off) when unset or blank", () => {
    expect(parseReviewerEmails(undefined).size).toBe(0);
    expect(parseReviewerEmails("  ").size).toBe(0);
  });
});

describe("gateAuthRequest", () => {
  it("never touches Google sign-in, sessions or sign-out", async () => {
    const d = deps({ emails: () => new Set() });
    for (const path of [["sign-in", "social"], ["get-session"], ["sign-out"], ["callback", "google"]]) {
      expect(await gateAuthRequest("POST", path, new Request("https://rankbyai.live/api/auth/x", { method: "POST" }), d)).toBeNull();
    }
    expect(d.keys).toEqual([]);
  });

  it("always refuses password sign-up and resets, even with the list on", async () => {
    for (const path of [["sign-up", "email"], ["forget-password"], ["request-password-reset"], ["reset-password"], ["set-password"]]) {
      const res = await gateAuthRequest("POST", path, signIn({ email: REVIEWER, password: "x" }), deps());
      expect(res?.status).toBe(404);
    }
  });

  it("answers 404 to password sign-in while the list is empty", async () => {
    const d = deps({ emails: () => new Set() });
    const res = await gateAuthRequest("POST", ["sign-in", "email"], signIn({ email: REVIEWER, password: "x" }), d);
    expect(res?.status).toBe(404);
    expect(d.keys).toEqual([]);
  });

  it("lets a listed address through to Neon Auth, whatever its case, with the body still readable", async () => {
    const d = deps();
    const req = signIn({ email: " Review@RankbyAI.LIVE ", password: "secret" });
    expect(await gateAuthRequest("POST", ["sign-in", "email"], req, d)).toBeNull();
    expect(await req.json()).toEqual({ email: " Review@RankbyAI.LIVE ", password: "secret" });
    expect(d.keys).toHaveLength(1);
    expect(d.keys[0]).toMatch(/^reviewer-login:/);
    expect(d.keys[0]).not.toContain("203.0.113.9");
  });

  it("refuses an unlisted address exactly like a wrong password, after the time floor", async () => {
    const d = deps();
    const res = await gateAuthRequest("POST", ["sign-in", "email"], signIn({ email: "owner@gmail.com", password: "x" }), d);
    expect(res?.status).toBe(401);
    expect(await res?.json()).toEqual({ code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" });
    expect(d.slept).toEqual([REFUSAL_FLOOR_MS]);
  });

  it("refuses a body that is not JSON or has no email", async () => {
    expect((await gateAuthRequest("POST", ["sign-in", "email"], signIn("email=a"), deps()))?.status).toBe(401);
    expect((await gateAuthRequest("POST", ["sign-in", "email"], signIn({ password: "x" }), deps()))?.status).toBe(401);
  });

  it("counts every attempt before reading the list: 429 over the limit, 503 when the limiter is down", async () => {
    expect((await gateAuthRequest("POST", ["sign-in", "email"], signIn({ email: REVIEWER, password: "x" }), deps({ hit: async () => false })))?.status).toBe(429);
    expect((await gateAuthRequest("POST", ["sign-in", "email"], signIn({ email: REVIEWER, password: "x" }), deps({ hit: async () => { throw new Error("down"); } })))?.status).toBe(503);
  });

  it("refuses other methods on the sign-in path", async () => {
    expect((await gateAuthRequest("GET", ["sign-in", "email"], new Request("https://rankbyai.live/api/auth/sign-in/email"), deps()))?.status).toBe(404);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { emailProvider, parseSender, sendEmail } from "@/lib/email";

const KEY = "xkeysib-LEAKY-000";
const message = { to: "buyer@example.com", subject: "RankbyAI lifetime access: seat #1", text: "You're in.", replyTo: "owner@example.com" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("email sender", () => {
  it("reads a name and address, or a bare address", () => {
    expect(parseSender("RankbyAI <noreply@example.com>")).toEqual({ name: "RankbyAI", email: "noreply@example.com" });
    expect(parseSender('"Rank by AI" <noreply@example.com>')).toEqual({ name: "Rank by AI", email: "noreply@example.com" });
    expect(parseSender("noreply@example.com")).toEqual({ name: "RankbyAI", email: "noreply@example.com" });
    expect(parseSender("not an address")).toBeNull();
  });

  it("is off without a sender and a provider key, and prefers Brevo when both keys are set", () => {
    vi.stubEnv("EMAIL_FROM", "");
    vi.stubEnv("BREVO_API_KEY", KEY);
    expect(emailProvider()).toBeNull();
    vi.stubEnv("EMAIL_FROM", "noreply@example.com");
    expect(emailProvider()).toBe("brevo");
    vi.stubEnv("RESEND_API_KEY", "re_x");
    expect(emailProvider()).toBe("brevo");
    vi.stubEnv("BREVO_API_KEY", "");
    expect(emailProvider()).toBe("resend");
  });
});

describe("sending through Brevo", () => {
  it("posts the message with the key in the api-key header only, and replies go to the contact address", async () => {
    vi.stubEnv("EMAIL_FROM", "RankbyAI <noreply@example.com>");
    vi.stubEnv("BREVO_API_KEY", KEY);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messageId: "<1@smtp>" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail(message)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((init.headers as Record<string, string>)["api-key"]).toBe(KEY);
    expect(String(init.body)).not.toContain("LEAKY");
    expect(JSON.parse(String(init.body))).toEqual({
      sender: { name: "RankbyAI", email: "noreply@example.com" },
      to: [{ email: "buyer@example.com" }],
      subject: message.subject,
      textContent: message.text,
      replyTo: { email: "owner@example.com" },
    });
  });

  it("reports a refusal as not sent, without logging the key", async () => {
    vi.stubEnv("EMAIL_FROM", "noreply@example.com");
    vi.stubEnv("BREVO_API_KEY", KEY);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "unauthorized", message: `Key not found: ${KEY}` }), { status: 401 })));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendEmail(message)).toBe(false);
    expect(JSON.stringify(error.mock.calls)).not.toContain("LEAKY");
    expect(JSON.stringify(error.mock.calls)).toContain("unauthorized");
  });

  it("is skipped, not failed, when email is not configured", async () => {
    vi.stubEnv("EMAIL_FROM", "");
    vi.stubEnv("BREVO_API_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await sendEmail(message)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

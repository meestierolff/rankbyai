import "server-only";
import { Resend } from "resend";

/**
 * Transactional email. Set EMAIL_FROM plus one provider key:
 *   BREVO_API_KEY   Brevo (https://developers.brevo.com/reference/send-transac-email), used when set
 *   RESEND_API_KEY  Resend
 * EMAIL_FROM is "Name <address>" or a bare address, and must be a sender the provider has verified.
 * Returns false (and logs why, never the key) when email is not configured or the send fails.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

/** "RankbyAI <noreply@example.com>" → { name, email }. A bare address gets the product name. */
export function parseSender(from: string): { name: string; email: string } | null {
  const m = /^\s*(?:"?([^"<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>|([^<>\s]+@[^<>\s]+))\s*$/.exec(from);
  if (!m) return null;
  const email = m[2] ?? m[3];
  return { name: (m[1] ?? "").trim() || "RankbyAI", email };
}

export const emailProvider = (): "brevo" | "resend" | null =>
  !process.env.EMAIL_FROM ? null : process.env.BREVO_API_KEY ? "brevo" : process.env.RESEND_API_KEY ? "resend" : null;

async function sendWithBrevo(key: string, from: string, opts: EmailMessage): Promise<boolean> {
  const sender = parseSender(from);
  if (!sender) {
    console.error("[email] EMAIL_FROM is not an address");
    return false;
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender,
        to: [{ email: opts.to }],
        subject: opts.subject,
        textContent: opts.text,
        ...(opts.replyTo ? { replyTo: { email: opts.replyTo } } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return true;
    const body = (await res.json().catch(() => null)) as { code?: string } | null;
    console.error("[email] Brevo refused the message:", res.status, body?.code ?? "");
    return false;
  } catch (err) {
    console.error("[email] Brevo could not be reached:", err instanceof Error ? err.name : "unknown");
    return false;
  }
}

export async function sendEmail(opts: EmailMessage): Promise<boolean> {
  const from = process.env.EMAIL_FROM;
  const provider = emailProvider();
  if (!from || !provider) {
    console.warn("[email] EMAIL_FROM plus BREVO_API_KEY or RESEND_API_KEY not set; skipped:", opts.subject);
    return false;
  }
  if (provider === "brevo") return sendWithBrevo(process.env.BREVO_API_KEY!, from, opts);

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const { error } = await resend.emails.send({ from, to: opts.to, subject: opts.subject, text: opts.text, replyTo: opts.replyTo });
  if (error) {
    console.error("[email] send failed:", error.name);
    return false;
  }
  return true;
}

import "server-only";
import { Resend } from "resend";
import { emailEnv } from "@/lib/env";

/** Sends a transactional email through Resend. Returns false (and logs once) when email is not configured. */
export async function sendEmail(opts: { to: string; subject: string; text: string; replyTo?: string }): Promise<boolean> {
  if (!emailEnv.isConfigured()) {
    console.warn("[email] RESEND_API_KEY / EMAIL_FROM not set; skipped:", opts.subject);
    return false;
  }
  const env = emailEnv.get();
  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    replyTo: opts.replyTo,
  });
  if (error) {
    console.error("[email] send failed:", error.name);
    return false;
  }
  return true;
}

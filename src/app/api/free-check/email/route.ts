import { captureResultEmail, CHECK_COOKIE, EmailBody, readCookie } from "@/lib/free-check-public";
import { clientIp } from "@/lib/request";

/**
 * Optional, after the result: emails that result to the address the visitor typed. Only the browser
 * holding the check's cookie can use it, once per check, with fixed content (so it cannot be used to
 * send mail to strangers), and `marketing` is stored only when the separate box was ticked.
 */
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const parsed = EmailBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_email", message: "Enter a valid email address." }, { status: 400, headers });
  const result = await captureResultEmail({
    cookie: readCookie(request.headers.get("cookie"), CHECK_COOKIE), ip: clientIp(request.headers), headers: request.headers,
    email: parsed.data.email, marketing: parsed.data.marketing,
  }).catch(() => null);
  if (!result) return Response.json({ error: "unavailable", message: "We could not save your address. Try again." }, { status: 503, headers });
  if (!result.ok) return Response.json({ error: result.error, message: result.message }, { status: result.status, headers });
  return Response.json({ ok: true, sent: result.sent }, { headers });
}

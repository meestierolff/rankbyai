/**
 * OpenAI plugin directory domain verification: the dashboard shows a token, which goes into the
 * OPENAI_APPS_CHALLENGE environment variable; this answers it as plain text. 404 while it is unset.
 */
export function GET(): Response {
  const token = process.env.OPENAI_APPS_CHALLENGE?.trim();
  if (!token) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(token, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

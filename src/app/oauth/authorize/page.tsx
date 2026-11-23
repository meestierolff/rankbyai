import { notFound, redirect } from "next/navigation";
import { ConsentError, ConsentScreen } from "@/components/oauth/consent";
import { getSessionContext } from "@/lib/auth";
import { prepareAuthorization } from "@/lib/oauth/authorize";
import { oauthOpen } from "@/lib/oauth/config";

type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * OAuth authorization endpoint (GET). Signed-out users go to /login and come back here; then the
 * owner sees what the app asks for and which workspace it gets, and allows or denies.
 */
export default async function Page({ searchParams }: { searchParams: Search }) {
  // Read the query first: it makes the page request-time whatever the flag says at build time.
  const sp = await searchParams;
  if (!oauthOpen()) notFound();
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const one of Array.isArray(v) ? v : v === undefined ? [] : [v]) q.append(k, one);

  const r = await prepareAuthorization(q, await getSessionContext());
  if (r.kind === "login") redirect(`/login?next=${encodeURIComponent(r.next)}`);
  if (r.kind === "redirect") redirect(r.url);
  if (r.kind === "error") return <ConsentError title={r.title} message={r.message} />;
  return <ConsentScreen view={r.view} ticket={r.ticket} />;
}

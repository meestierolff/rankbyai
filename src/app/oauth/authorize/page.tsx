import { notFound, redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { prepareAuthorization } from "@/lib/oauth/authorize";
import { oauthOpen } from "@/lib/oauth/config";
import { ConsentButtons } from "./consent-buttons";

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
  if (r.kind === "error") {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="m-0 text-[26px] leading-[1.1] font-semibold tracking-[-0.03em]">{r.title}</h1>
        <p className="m-0 text-[15px] leading-[1.6] text-muted-foreground">{r.message}</p>
      </div>
    );
  }

  const v = r.view;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="m-0 font-mono text-[12px] tracking-[0.14em] text-dim uppercase">Connect an app</p>
        <h1 className="m-0 text-[clamp(24px,5vw,30px)] leading-[1.1] font-semibold tracking-[-0.035em] text-balance">
          Allow {v.clientName} to use RankbyAI?
        </h1>
        <p className="m-0 text-[15px] leading-[1.6] text-muted-foreground">
          It will act in your workspace <strong className="text-fg">{v.workspaceName}</strong>, as you ({v.email}).
        </p>
      </div>

      <dl className="m-0 grid gap-2 rounded-[12px] border border-border bg-surface px-4 py-3 text-[14px] leading-normal">
        <div className="flex flex-wrap gap-x-2"><dt className="text-dim">App name</dt><dd className="m-0">{v.clientName} <span className="text-dim">(given by the app, not verified)</span></dd></div>
        {v.clientHost ? <div className="flex flex-wrap gap-x-2"><dt className="text-dim">App address</dt><dd className="m-0 font-mono text-[13px]">{v.clientHost}</dd></div> : null}
        <div className="flex flex-wrap gap-x-2"><dt className="text-dim">Sends you back to</dt><dd className="m-0 font-mono text-[13px] break-all">{v.redirectTargets.join(", ")}</dd></div>
      </dl>

      {v.localOnly ? (
        <p role="note" className="m-0 rounded-[12px] border border-[rgba(255,122,26,0.5)] bg-[rgba(255,122,26,0.08)] px-4 py-3 text-[14px] leading-normal">
          This app runs on your own computer. Only allow it if you started this connection yourself just now.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 text-[14.5px] leading-[1.55]">
        <p className="m-0 font-medium">It will be able to:</p>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
          <li>read your businesses, scans, audits, Fix Kits, prospect reports, branding and usage;</li>
          <li>add and change businesses and branding, and delete businesses;</li>
          <li>start paid scans, audits and prospect reports. Each one returns its cost first and runs only after a confirmation.</li>
        </ul>
        <p className="m-0 text-muted-foreground">
          It never sees your stored API keys (DataForSEO, OpenAI, Perplexity, Gemini), your Google account or your payment details.
          You can disconnect it at any time under API &amp; MCP in the app.
        </p>
      </div>

      <ConsentButtons ticket={r.ticket} clientName={v.clientName} />
    </div>
  );
}

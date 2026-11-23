import Link from "next/link";
import { Ban, Eye, PencilLine, Wallet } from "lucide-react";
import { DotMark } from "@/components/marketing/lp";
import type { ConsentView } from "@/lib/oauth/authorize";
import { ConsentButtons } from "./consent-buttons";

/**
 * The OAuth consent screen. One idea carries it: the app and RankbyAI joined by a row of the
 * brand's own dots, the middle one orange like the mark's centre. Everything else is plain and
 * checkable: who asks, which workspace, what it can and cannot do, where it sends you back.
 *
 * The app's own logo is never loaded: its name is given by the app and not verified, so a monogram
 * stands in for it (no remote image, no borrowed trust).
 */

/** One letter per word, at most two: "Claude" → "C", "MCP Inspector" → "MI". */
export function monogram(name: string): string {
  // Accents off first ("Ü" → "U"), so a combining mark never splits a word in two.
  const words = name.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 1);
  return letters.toUpperCase() || "?";
}

function ConnectionMark({ clientName }: { clientName: string }) {
  const tile = "flex size-[52px] shrink-0 items-center justify-center rounded-[14px]";
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className={`${tile} border border-border-strong bg-surface-2 font-display text-[19px] font-extrabold tracking-[-0.02em] text-fg`}>{monogram(clientName)}</span>
      <span className="flex items-center gap-[7px]">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`block rounded-full motion-safe:animate-rb-pop ${i === 2 ? "size-[9px] bg-lp-accent" : "size-[5px] bg-lp-fg/55"}`}
            style={{ animationDelay: `${120 + i * 70}ms` }}
          />
        ))}
      </span>
      <span className={`${tile} border border-[#2a2a2a] bg-black`}><DotMark size={32} /></span>
    </div>
  );
}

const CAN: { icon: typeof Eye; title: string; body: string }[] = [
  { icon: Eye, title: "Read", body: "your businesses, scans, prompt packs, cited pages, citation targets, audits, Fix Kits, prospect reports, branding and usage." },
  { icon: PencilLine, title: "Change", body: "add and edit businesses and your report branding, and delete businesses." },
  { icon: Wallet, title: "Start paid work", body: "scans, prompt packs, citation target searches, audits and prospect reports. Each one shows its cost first and runs only after it is confirmed." },
];

export function ConsentScreen({ view, ticket }: { view: ConsentView; ticket: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5">
        <ConnectionMark clientName={view.clientName} />
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[clamp(26px,5.5vw,32px)] leading-[1.06] font-semibold tracking-[-0.04em] text-balance">
            Allow {view.clientName} to use RankbyAI?
          </h1>
          <p className="m-0 text-[15px] leading-[1.6] text-muted-foreground">
            It will work in <strong className="font-medium text-fg">{view.workspaceName}</strong>, signed in as {view.email}.
          </p>
        </div>
      </div>

      {view.localOnly ? (
        <p role="note" className="m-0 rounded-[12px] border border-[rgba(255,122,26,0.45)] bg-[rgba(255,122,26,0.07)] px-4 py-3 text-[14px] leading-normal">
          This app runs on your own computer. Allow it only if you started this connection yourself just now.
        </p>
      ) : null}

      <section aria-labelledby="can" className="flex flex-col gap-3">
        <h2 id="can" className="m-0 font-mono text-[11.5px] font-normal tracking-[0.12em] text-dim uppercase">It can</h2>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {CAN.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3 text-[14.5px] leading-[1.5]">
              <Icon aria-hidden className="mt-[2px] size-[17px] shrink-0 text-lp-fg/70" strokeWidth={1.75} />
              <span className="text-muted-foreground"><span className="font-medium text-fg">{title}</span> {body}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="cannot" className="flex flex-col gap-3 border-t border-line pt-5">
        <h2 id="cannot" className="m-0 font-mono text-[11.5px] font-normal tracking-[0.12em] text-dim uppercase">It can&apos;t</h2>
        <p className="m-0 flex gap-3 text-[14.5px] leading-[1.5] text-muted-foreground">
          <Ban aria-hidden className="mt-[2px] size-[17px] shrink-0 text-lp-fg/70" strokeWidth={1.75} />
          <span>See your stored API keys (DataForSEO, OpenAI, Perplexity, Gemini), your Google account or your payment details.</span>
        </p>
      </section>

      <dl className="m-0 grid gap-x-4 gap-y-1.5 rounded-[12px] border border-border bg-surface px-4 py-3 text-[13.5px] leading-normal sm:grid-cols-[auto_1fr]">
        <dt className="text-dim">App name</dt>
        <dd className="m-0">{view.clientName}{view.selfAsserted ? <span className="text-dim"> · given by the app, not verified</span> : null}</dd>
        {view.clientHost ? (
          <>
            <dt className="text-dim">App address</dt>
            <dd className="m-0 font-mono text-[12.5px] break-all">{view.clientHost}</dd>
          </>
        ) : null}
        <dt className="text-dim">Sends you back to</dt>
        <dd className="m-0 font-mono text-[12.5px] break-all">{view.redirectTargets.join(", ")}</dd>
      </dl>

      <ConsentButtons ticket={ticket} clientName={view.clientName} />

      <p className="m-0 text-[13px] leading-normal text-dim">
        Disconnect it any time under API &amp; MCP in the app. <Link href="/privacy" className="underline underline-offset-[3px]">Privacy</Link> ·{" "}
        <Link href="/terms" className="underline underline-offset-[3px]">Terms</Link>
      </p>
    </div>
  );
}

/** A request that cannot go on: what is wrong and where to go, in the same frame. */
export function ConsentError({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col gap-4">
      <span className="flex size-[52px] items-center justify-center rounded-[14px] border border-[#2a2a2a] bg-black" aria-hidden><DotMark size={32} /></span>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[clamp(24px,5vw,28px)] leading-[1.1] font-semibold tracking-[-0.035em] text-balance">{title}</h1>
        <p className="m-0 text-[15px] leading-[1.6] text-muted-foreground">{message}</p>
      </div>
      <p className="m-0 text-[14px] text-muted-foreground">
        Start the connection again from the app, or <Link href="/support" className="text-fg underline underline-offset-[3px]">get help</Link>.
      </p>
    </div>
  );
}

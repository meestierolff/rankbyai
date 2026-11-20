"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Answers after which the server's state is different, so a refresh shows something new. */
const STATE_CHANGED = new Set(["failed", "retry", "day_cap", "month_cap", "not_found"]);

/**
 * Runs the check held in this browser's cookie and refreshes the page when the server has news
 * (result, failure, or a budget cap). "running" means another tab or an earlier load of this page is
 * doing the work: ask again until it is done (the call is idempotent).
 */
export function CheckRunner({ businessName }: { businessName: string }) {
  const router = useRouter();
  const [slow, setSlow] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const slowTimer = setTimeout(() => setSlow(true), 75_000);
    (async () => {
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          const res = await fetch("/api/free-check/execute", { method: "POST", cache: "no-store" });
          const json = (await res.json().catch(() => ({}))) as { running?: boolean; message?: string; error?: string };
          if (res.ok || STATE_CHANGED.has(json.error ?? "")) {
            // Done, failed, one retry left, capped or gone: the page renders the state the server now holds.
            router.refresh();
            return;
          }
          if (!json.running) {
            // Nothing changed on the server (unavailable): say so instead of refreshing into a loop.
            setMessage(json.message ?? "The check could not run right now. Reload this page later: your check is kept.");
            return;
          }
        } catch {
          setMessage("We lost the connection. Reload this page to continue: your check is kept.");
          return;
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
      setMessage("The check is taking longer than expected. Reload this page in a minute.");
    })();
    return () => clearTimeout(slowTimer);
  }, [router]);

  return (
    <div className="flex max-w-[620px] flex-col items-start gap-4" aria-live="polite">
      <h1 className="m-0 text-[clamp(28px,3.6vw,40px)] leading-[1.08] font-semibold tracking-[-0.04em] text-balance">
        Checking {businessName}…
      </h1>
      {message ? (
        <p role="alert" className="m-0 text-[16px] leading-normal text-lp-muted">{message}</p>
      ) : (
        <>
          <p className="m-0 text-[16px] leading-[1.6] text-lp-muted">
            We are finding the business on Google Maps and asking ChatGPT, Perplexity and Gemini who they recommend at its location. This takes about a minute. Keep this page open.
          </p>
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-lp-line"><div className="h-full w-1/3 animate-pulse rounded-full bg-lp-fg" /></div>
          {slow ? <p className="m-0 text-[14px] text-lp-dim">Still working. Some assistants take longer to answer.</p> : null}
        </>
      )}
    </div>
  );
}

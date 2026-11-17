"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ctaClass } from "@/components/brand/primitives";
import { track } from "@/lib/analytics";

export function RunFreeCheck() {
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fc = new URLSearchParams(window.location.search).get("fc");
    (async () => {
      try {
        const res = await fetch("/api/free-check/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fc }) });
        const json = (await res.json().catch(() => ({}))) as { slug?: string; message?: string };
        if (res.ok && json.slug) {
          track("free_check_completed");
          window.location.replace(`/r/${json.slug}`);
          return;
        }
        setMessage(json.message ?? "The check could not run. Open the link from your email again.");
      } catch {
        setMessage("The check could not run. Open the link from your email again.");
      }
    })();
  }, []);

  return (
    <div className="flex max-w-[520px] flex-col items-start gap-4" aria-live="polite">
      {message ? (
        <>
          <h1 className="m-0 text-[30px] leading-[1.1] font-semibold tracking-[-0.03em]">Your free check did not run.</h1>
          <p role="alert" className="m-0 text-[16px] leading-normal text-muted-foreground">{message}</p>
          <Link href="/#pricing" className={ctaClass("md")}><span>See what the full product does</span><span aria-hidden>→</span></Link>
        </>
      ) : (
        <>
          <h1 className="m-0 text-[30px] leading-[1.1] font-semibold tracking-[-0.03em]">Running your free check…</h1>
          <p className="m-0 text-[16px] leading-normal text-muted-foreground">
            We are finding the business on Google Maps and asking the AI assistants who they recommend at its location. This takes up to a minute. Keep this page open.
          </p>
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-border"><div className="h-full w-1/3 animate-pulse rounded-full bg-fg" /></div>
        </>
      )}
    </div>
  );
}

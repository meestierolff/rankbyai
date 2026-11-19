"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/app/ui";
import { ctaClass } from "@/components/brand/primitives";
import { isVersionSkewError, reloadOnce, skewReloadAllowed } from "@/lib/version-skew";

/**
 * A page that could not load. Reads that fail throw (see lib/db/member-read), so this shows
 * instead of a wrong "nothing here yet". `retry` fetches the page again.
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  // A new version went live while this tab was open: reload onto it instead of showing an error
  // (at most once a minute; after that the error shows as usual).
  const reloading = isVersionSkewError(error) && skewReloadAllowed();
  useEffect(() => {
    if (reloading) reloadOnce();
    else console.error(error);
  }, [error, reloading]);
  if (reloading) return <p className="m-0 text-[14px] text-muted-foreground">Loading the latest version…</p>;
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <div className="flex flex-col items-start gap-4">
      <ErrorState
        title="This page could not load"
        body={<>Something failed while loading it, so the page shows this message instead of a wrong empty list. Nothing was charged and no scan was started.{digest ? <> Reference: <span className="font-mono">{digest}</span>.</> : null}</>}
      />
      <button type="button" onClick={() => retry()} className={ctaClass("sm", "cursor-pointer border-0")}>
        <span>Try again</span>
      </button>
    </div>
  );
}

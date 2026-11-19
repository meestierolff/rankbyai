"use client";

import { useEffect } from "react";
import { isVersionSkewError, reloadOnce, skewReloadAllowed } from "@/lib/version-skew";

/**
 * Last-resort error page (the root layout itself failed). An error from an older version of the
 * site reloads quietly onto the current one; anything else gets a plain page with a retry.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const reloading = isVersionSkewError(error) && skewReloadAllowed();
  useEffect(() => {
    if (reloading) reloadOnce();
    else console.error(error);
  }, [error, reloading]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", background: "#0b0b0b", color: "#f5f5f5", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" }}>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: 32 }}>
          {reloading ? (
            <p style={{ margin: 0, color: "#a1a1a1" }}>Loading the latest version…</p>
          ) : (
            <>
              <h1 style={{ margin: "0 0 16px", fontSize: 32, letterSpacing: "-0.03em" }}>Something went wrong.</h1>
              <p style={{ margin: "0 0 24px", color: "#a1a1a1" }}>The page could not load.{error.digest ? ` Reference: ${error.digest}.` : ""}</p>
              <button type="button" onClick={() => retry()} style={{ padding: "10px 18px", borderRadius: 999, border: 0, background: "#f5f5f5", color: "#0b0b0b", fontWeight: 600, cursor: "pointer" }}>
                Try again
              </button>
            </>
          )}
        </main>
      </body>
    </html>
  );
}

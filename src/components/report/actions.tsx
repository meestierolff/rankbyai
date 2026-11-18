"use client";

import { useState, type ReactNode } from "react";
import { track } from "@/lib/analytics";

/** Copies the address of the page the reader is on (works the same on a custom domain). */
export function CopyLinkButton({ className, children = "Copy the report link" }: { className?: string; children?: ReactNode }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setState("copied");
        } catch {
          setState("failed");
        }
      }}
    >
      <span aria-live="polite">{state === "copied" ? "Link copied" : state === "failed" ? "Copy the address bar instead" : children}</span>
    </button>
  );
}

/** "Download PDF". Counted as pdf_downloaded (no identifiers). */
export function PdfLink({ href, kind, className, children = "Download PDF" }: { href: string; kind: string; className?: string; children?: ReactNode }) {
  return (
    <a href={href} download className={className} rel="nofollow" onClick={() => track("pdf_downloaded", { kind, from: "report_page" })}>
      {children}
    </a>
  );
}

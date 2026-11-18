"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
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

const noSubscribe = () => () => {};

/**
 * The fix prompt in a scrollable block with a copy button. The live report's address is added on the
 * client: it is whatever address the reader opened, so a custom domain stays a custom domain.
 */
export function FixPromptBlock({ text, kind }: { text: string; kind: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  // The address the reader opened (null while rendering on the server; it does not change after load).
  const url = useSyncExternalStore(noSubscribe, () => window.location.href.split("#")[0], () => null);
  const full = url ? `${text}\n\nThe full report: ${url}` : text;
  return (
    <div className="flex flex-col gap-3">
      <pre className="m-0 max-h-[360px] overflow-auto rounded-2xl border border-lp-border-2 bg-lp-surface p-5 font-mono text-[13px] leading-[1.6] whitespace-pre-wrap text-lp-fg-2">{full}</pre>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex cursor-pointer items-center rounded-full border-0 bg-lp-fg px-5 py-[10px] text-[15px] font-semibold text-lp-bg"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(full);
              setState("copied");
              track("fix_prompt_copied", { kind });
            } catch {
              setState("failed");
            }
          }}
        >
          <span aria-live="polite">{state === "copied" ? "Prompt copied" : state === "failed" ? "Select the text above and copy it" : "Copy the prompt"}</span>
        </button>
        <span className="text-[13.5px] text-lp-muted">Paste it into ChatGPT, Claude, Gemini or the AI assistant in your website builder.</span>
      </div>
    </div>
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

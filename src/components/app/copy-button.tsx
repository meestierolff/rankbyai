"use client";

import { useState } from "react";
import { ctaClass, secondaryClass } from "@/components/brand/primitives";

/** Copies `text`; says so, or says how to copy by hand when the browser refuses. */
export function CopyButton({ text, label, primary = false }: { text: string; label: string; primary?: boolean }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className={primary ? ctaClass("sm", "cursor-pointer border-0") : secondaryClass("cursor-pointer")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("copied");
        } catch {
          setState("failed");
        }
      }}
    >
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Select the text and copy it" : label}</span>
    </button>
  );
}

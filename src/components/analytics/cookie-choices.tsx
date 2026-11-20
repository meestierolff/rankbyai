"use client";

import { openConsentChoices } from "@/lib/consent";

/** Reopens the consent banner, so a choice can be changed or withdrawn as easily as it was given. */
export function CookieChoicesButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openConsentChoices} className={`cursor-pointer border-0 bg-transparent p-0 text-left ${className ?? ""}`}>
      Cookie choices
    </button>
  );
}

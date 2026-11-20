"use client";

import { useEffect } from "react";
import { reportConversion } from "@/lib/conversions";

/**
 * In the signed-in app (mounted once per full page load by the app layout): asks the server whether
 * this account is a new signup not yet reported. Only then sign_up goes to GA4 and Google Ads, within
 * consent. Nothing is stored in the browser for this; "once" is decided by the server.
 */
export function SignupConversion() {
  useEffect(() => {
    fetch("/api/conversions/signup", { method: "POST", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { first?: boolean } | null) => {
        if (s?.first) reportConversion("sign_up");
      })
      .catch(() => undefined);
  }, []);
  return null;
}

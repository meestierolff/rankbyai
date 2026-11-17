"use client";

import { useEffect } from "react";
import { trackOnce } from "@/lib/analytics";

/** Fires share_link_viewed once per page load. No identifiers in the properties. */
export function ReportViewed({ kind }: { kind: string }) {
  useEffect(() => {
    trackOnce("share_link_viewed", { kind });
  }, [kind]);
  return null;
}

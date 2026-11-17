"use client";

import { useEffect } from "react";
import { trackOnce } from "@/lib/analytics";

export function CompareViewed({ kind }: { kind: string }) {
  useEffect(() => {
    trackOnce("compare_viewed", { kind });
  }, [kind]);
  return null;
}

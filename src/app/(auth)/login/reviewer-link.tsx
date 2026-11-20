"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { safeNextPath } from "@/lib/safe-next";

/** Link to the reviewer sign-in that keeps where the visitor was going (for example an app's consent page). */
export function ReviewerLink() {
  const router = useRouter();
  const go = (event: MouseEvent<HTMLAnchorElement>) => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (!next) return;
    event.preventDefault();
    router.push(`/login/reviewer?next=${encodeURIComponent(safeNextPath(next, "/app"))}`);
  };
  return (
    <a href="/login/reviewer" onClick={go} className="text-fg underline underline-offset-[3px]">
      Reviewer sign-in
    </a>
  );
}

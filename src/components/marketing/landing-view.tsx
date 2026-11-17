"use client";

import { useEffect } from "react";
import { trackOnce } from "@/lib/analytics";

/** Fires the `landing_view` funnel event once per page load. Renders nothing. */
export function LandingView() {
  useEffect(() => trackOnce("landing_view"), []);
  return null;
}

"use client";

import { useEffect } from "react";
import { isVersionSkewError, reloadOnce } from "@/lib/version-skew";

/** Catches old-version errors that happen outside rendering (a chunk loaded on click) and reloads quietly. */
export function SkewReload() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (isVersionSkewError(e.error ?? e.message)) reloadOnce();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isVersionSkewError(e.reason)) reloadOnce();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}

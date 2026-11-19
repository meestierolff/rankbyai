import { beforeEach, describe, expect, it, vi } from "vitest";
import { isVersionSkewError, reloadOnce, resetSkewGuard, skewReloadAllowed, SKEW_RELOAD_GAP_MS } from "@/lib/version-skew";

const fakeWin = () => {
  const store = new Map<string, string>();
  return {
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage,
    location: { reload: vi.fn() },
  };
};

describe("old-version errors after a deploy", () => {
  beforeEach(() => resetSkewGuard());

  it("recognises chunk and server-function errors, and nothing else", () => {
    expect(isVersionSkewError(Object.assign(new Error("Loading chunk 412 failed."), { name: "ChunkLoadError" }))).toBe(true);
    expect(isVersionSkewError(new TypeError("Failed to fetch dynamically imported module: https://rankbyai.live/_next/static/chunks/a.js"))).toBe(true);
    expect(isVersionSkewError(new Error('Failed to find Server Action "7f3a". This request might be from an older or newer deployment.'))).toBe(true);
    expect(isVersionSkewError(new Error("Prospect batch could not be loaded (PGRST301)"))).toBe(false);
    expect(isVersionSkewError(null)).toBe(false);
  });

  it("reloads at most once a minute, so a page that keeps failing shows its error", () => {
    const win = fakeWin();
    expect(reloadOnce(win, 1_000_000)).toBe(true);
    expect(win.location.reload).toHaveBeenCalledTimes(1);
    resetSkewGuard(); // a fresh page after the reload
    expect(skewReloadAllowed(win, 1_000_000 + SKEW_RELOAD_GAP_MS - 1)).toBe(false);
    expect(reloadOnce(win, 1_000_000 + SKEW_RELOAD_GAP_MS - 1)).toBe(false);
    expect(reloadOnce(win, 1_000_000 + SKEW_RELOAD_GAP_MS + 1)).toBe(true);
    expect(win.location.reload).toHaveBeenCalledTimes(2);
  });
});

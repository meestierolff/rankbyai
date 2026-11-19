/**
 * After a deploy, a tab opened on the previous version can ask for code that no longer exists (a
 * lazily loaded chunk, a server function from the old build). Those errors are not the user's
 * problem: the page reloads once, quietly, onto the new version. Anything else is a real error and
 * is shown as one.
 */
const SKEW = /ChunkLoadError|Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Failed to find Server Action|older or newer deployment/i;

export function isVersionSkewError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { name?: unknown; message?: unknown };
  const text = [typeof e.name === "string" ? e.name : "", typeof e.message === "string" ? e.message : "", typeof error === "string" ? error : ""].join(" ");
  return SKEW.test(text);
}

const KEY = "rbai_skew_reload_at";
/** Minimum time between two quiet reloads, so a page that keeps failing shows its error instead of looping. */
export const SKEW_RELOAD_GAP_MS = 60_000;

type Win = { sessionStorage?: Storage; location: { reload: () => void } };

/** Whether a quiet reload is allowed now (none in the last minute). `win` is injectable for tests. */
export function skewReloadAllowed(win: Win = window, now = Date.now()): boolean {
  if (reloadedThisPage) return false;
  let last = 0;
  try {
    last = Number(win.sessionStorage?.getItem(KEY) ?? 0) || 0;
  } catch {
    // Storage blocked: the in-page flag still allows only one reload.
  }
  return now - last >= SKEW_RELOAD_GAP_MS;
}

/** Reloads the page unless it already did so in the last minute. Returns true when it reloads. */
export function reloadOnce(win: Win = window, now = Date.now()): boolean {
  if (!skewReloadAllowed(win, now)) return false;
  reloadedThisPage = true;
  try {
    win.sessionStorage?.setItem(KEY, String(now));
  } catch {}
  win.location.reload();
  return true;
}
let reloadedThisPage = false;
/** Tests only. */
export const resetSkewGuard = () => {
  reloadedThisPage = false;
};

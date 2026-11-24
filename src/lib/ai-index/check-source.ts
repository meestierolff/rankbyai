/** In-memory handoff across a client navigation; no tracking parameters or storage. */
let pending: { path: string; at: number } | null = null;
export function setIndexCheckSource(path: string) {
  if (/^\/ai-index\/seo-agencies(?:\/[a-z]{2}\/[a-z0-9-]+)?$/.test(path)) pending = { path, at: Date.now() };
}
export function takeIndexCheckSource(): string | undefined {
  const source = pending;
  pending = null;
  return source && Date.now() - source.at < 30 * 60 * 1000 ? source.path : undefined;
}

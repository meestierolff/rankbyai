/**
 * Prompt pack runs are ordinary AI scans, one per prompt and repeat, tagged in `scans.label` as
 * "pack:<run>:<prompt>:<repeat>" (prompt from 0, repeat from 1). They are side runs: a pack asks
 * other questions than the business's tracked scans, so they must never become its "latest scan"
 * (share links, audits, regional pages, change notes, the scan lists). Pure.
 */
const LABEL = /^pack:([0-9a-f-]{36}):(\d{1,2}):([1-9])$/;

export const packLabel = (runId: string, prompt: number, repeat: number) => `pack:${runId}:${prompt}:${repeat}`;

export function parsePackLabel(label: string | null | undefined): { run: string; prompt: number; repeat: number } | null {
  const m = (label ?? "").match(LABEL);
  return m ? { run: m[1], prompt: Number(m[2]), repeat: Number(m[3]) } : null;
}

export const isPackRun = (label: string | null | undefined): boolean => (label ?? "").startsWith("pack:");

/**
 * PostgREST `or` filter for "not a prompt-pack scan". Null-safe: `label not like …` alone is NULL,
 * and so false, for the many scans without a label. The value is quoted because ":" is reserved in
 * `or` filters; `*` is PostgREST's wildcard for LIKE.
 * Use it in the query itself, before `.limit()`: a pack run adds 10 or more scans at once and would
 * otherwise push the real latest scans out of a limited read.
 */
export const NOT_PACK_RUN = 'label.is.null,label.not.like."pack:*"';

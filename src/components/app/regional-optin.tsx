"use client";

import { useState } from "react";

/** Owner opt-in: let this workspace's own-key scans count toward the public regional pages. */
export function RegionalOptIn({ initial, canEdit }: { initial: boolean; canEdit: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-start gap-3 text-[15px]">
        <input
          type="checkbox" checked={on} disabled={!canEdit || busy} className="mt-1 size-4 accent-[var(--rb-g1)]"
          onChange={async (e) => {
            const next = e.target.checked;
            setBusy(true);
            setProblem(null);
            const res = await fetch("/api/workspace/regional-sharing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) });
            setBusy(false);
            if (res.ok) setOn(next);
            else setProblem("The setting could not be saved.");
          }}
        />
        <span>Let my scans count toward the public “AI visibility by city” pages.</span>
      </label>
      <p className="m-0 max-w-[720px] text-[13px] leading-normal text-dim">
        Off by default. When on, the businesses that AI assistants named in your scans are added to anonymous city totals. Your workspace, your clients and which business you scanned are never shown. Scans on included credits already count, because they run on our keys.
      </p>
      {problem ? <p role="alert" className="m-0 text-[14px] text-danger">{problem}</p> : null}
    </div>
  );
}

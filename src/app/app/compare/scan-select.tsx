"use client";

import { formatTime, useHydrated } from "@/components/app/local-time";
import { inputClass } from "@/components/app/ui";

export interface ScanOption {
  id: string;
  grid_size: number;
  keyword: string | null;
  niche: string | null;
  created_at: string;
}

/**
 * The "Before" / "After" pickers. An <option> can only hold text, so this is a client component:
 * the scan times in the labels follow the viewer's time zone like every other time in /app.
 */
export function ScanSelect({ name, label, defaultValue, scans }: { name: string; label: string; defaultValue?: string; scans: ScanOption[] }) {
  const local = useHydrated();
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[12px] text-dim">
      {label}
      <select name={name} defaultValue={defaultValue} className={`${inputClass} py-[7px] text-[13px]`}>
        {scans.map((s) => (
          <option key={s.id} value={s.id}>{`${formatTime(s.created_at, "datetime", local)} · ${s.grid_size}×${s.grid_size} · “${s.niche ?? s.keyword}”`}</option>
        ))}
      </select>
    </label>
  );
}

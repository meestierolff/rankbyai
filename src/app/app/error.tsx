"use client";

import { ErrorState } from "@/components/app/ui";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <ErrorState body="This page could not load. Nothing was charged and no scan was started." />
      <button type="button" onClick={reset} className="cursor-pointer rounded-[10px] border border-border-strong bg-transparent px-[14px] py-[9px] text-[14px] font-medium text-fg hover:bg-line">
        Try again
      </button>
    </div>
  );
}

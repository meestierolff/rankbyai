import { miscEnv } from "@/lib/env";
import { REFUND_DAYS } from "@/lib/pricing-constants";

/** Honest early-access banner (brief 11.7). Text and dates come from EARLY_ACCESS_NOTE; hidden when unset. */
export function EarlyAccessBanner() {
  const note = miscEnv.earlyAccessNote();
  if (!note) return null;
  return (
    <div role="note" className="border-b border-line bg-surface-2 px-4 py-[10px] text-center text-[14px] leading-normal text-muted-foreground">
      <span className="font-semibold text-fg">Early access.</span> {note} {REFUND_DAYS}-day no-questions refund.
    </div>
  );
}

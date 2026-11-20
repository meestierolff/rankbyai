import type { Metadata } from "next";
import { PageShell } from "@/components/marketing/page-shell";
import { WithdrawButton } from "./withdraw-button";

export const metadata: Metadata = { title: "Remove your email address", robots: { index: false, follow: false }, referrer: "no-referrer" };

/**
 * The link in a free-check result email leads here. Removal happens on the button, not on opening the
 * link, because mail scanners open links on their own. The token stays in the browser (read on the client).
 */
export default function UnsubscribePage() {
  return (
    <PageShell>
      <div className="container-lp flex min-h-[60dvh] items-center py-20 text-lp-fg">
        <div className="flex max-w-[620px] flex-col items-start gap-4">
          <h1 className="m-0 text-[clamp(28px,3.6vw,40px)] leading-[1.08] font-semibold tracking-[-0.04em] text-balance">Remove your email address</h1>
          <p className="m-0 text-[16px] leading-[1.6] text-lp-muted">
            This deletes the address you gave after your free check, together with any choice to receive product news. Your check result itself is not linked to you.
          </p>
          <WithdrawButton />
        </div>
      </div>
    </PageShell>
  );
}

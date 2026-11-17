import type { Metadata } from "next";
import Link from "next/link";
import { LegalEmail, LegalEntity } from "@/components/legal-identity";
import { ProsePage } from "@/components/marketing/page-shell";
import { PACKS, REFUND_DAYS } from "@/lib/pricing-constants";

export const metadata: Metadata = {
  title: "Refund Policy",
  description:
    "RankbyAI refunds any purchase within 14 days, no questions asked. How to ask, how the money comes back, what happens to your workspace and what we cannot refund.",
  alternates: { canonical: "/refunds" },
};

export default function RefundsPage() {
  return (
    <ProsePage
      eyebrow="Legal"
      title="Refund Policy"
      updated="17 November 2026"
      intro={
        <>
          You can get your money back within {REFUND_DAYS} days of buying. No questions asked. This page is part of the <Link href="/terms">terms of service</Link>.
        </>
      }
    >
      <h2>The short version</h2>
      <ul>
        <li>
          <strong>{REFUND_DAYS} days, no questions.</strong> The {REFUND_DAYS} days start on the day you buy.
        </li>
        <li>The lifetime plan is refunded in full.</li>
        <li>For a pack of included scans, the unused part is refunded.</li>
        <li>The money goes back through Stripe to the payment method you used.</li>
      </ul>

      <h2>How to ask</h2>
      <ul>
        <li>
          Email <LegalEmail /> from the email address you bought with. You do not need to give a reason.
        </li>
        <li>
          Or use the <strong>Request refund</strong> button on the billing page in the app. It is shown for {REFUND_DAYS} days after each order.
        </li>
      </ul>

      <h2>How the money comes back</h2>
      <p>
        We refund through Stripe to the original payment method. We cannot send it to a different card or account. Your bank or card issuer decides how long it takes to show on your statement.
      </p>
      <p>Prices exclude tax, and tax is calculated at checkout. A refund includes the tax charged on the amount refunded.</p>

      <h2>What happens to your workspace</h2>
      <ul>
        <li>After a lifetime refund, your workspace returns to locked.</li>
        <li>Your data is kept so that you can export it.</li>
        <li>If you want your data deleted instead, email us.</li>
      </ul>

      <h2>Your seat still counts on the price ladder</h2>
      <p>
        The lifetime price rises with every few sales. A refunded seat still counts as sold, so a refund never lowers the price for anyone. If you buy again later, you pay the price shown at that
        time, as long as the lifetime deal is still open.
      </p>

      <h2>Packs of included scans</h2>
      <ul>
        <li>
          This covers both packs: {PACKS.pack_25.credits} credits and {PACKS.pack_100.credits} credits.
        </li>
        <li>Within {REFUND_DAYS} days of purchase, the unused part of a pack is refundable.</li>
        <li>Credits you have already used are not refundable.</li>
        <li>The refunded credits are removed from your balance.</li>
        <li>Credits never expire and cannot be transferred to another workspace.</li>
      </ul>

      <h2>What we cannot refund</h2>
      <p>
        <strong>Money you spent with API vendors.</strong> When you scan with your own keys, you pay DataForSEO, OpenAI, Perplexity or Google directly. We never receive that money, so we cannot
        refund it. Contact the vendor about those charges.
      </p>

      <h2>After {REFUND_DAYS} days</h2>
      <p>
        After {REFUND_DAYS} days we refund only where the law requires it. If something is wrong, email <LegalEmail /> and we will look at it.
      </p>

      <h2>Your legal rights</h2>
      <p>
        This policy is on top of your legal rights, not in place of them. If you are a consumer, nothing here limits the rights that consumer law gives you. The seller is <LegalEntity />. Stripe
        processes the payment and is not the merchant of record.
      </p>
    </ProsePage>
  );
}

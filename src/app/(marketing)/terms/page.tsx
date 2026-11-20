import type { Metadata } from "next";
import Link from "next/link";
import { LegalAddress, LegalEmail, LegalEntity, LegalKvk } from "@/components/legal-identity";
import { ProsePage } from "@/components/marketing/page-shell";
import { AI_DISCLAIMER_TEXT, NOT_AFFILIATED } from "@/lib/copy";
import { miscEnv } from "@/lib/env";
import { DEFAULT_LADDER, fmtPrice, formatClosesAt } from "@/lib/ladder";
import { largerMapsGridsText, largestOneCreditMapsGrid } from "@/lib/cost/credits";
import { CREDIT_COST, FAIR_USE, PACKS, REFUND_DAYS } from "@/lib/pricing-constants";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The rules for using RankbyAI: the lifetime plan, your own API keys and data costs, included scan credits, acceptable use, refunds and liability. In plain English.",
  alternates: { canonical: "/terms" },
};

const usd = (cents: number) => fmtPrice(cents / 100);

export default function TermsPage() {
  const affiliate = Boolean(miscEnv.dataforseoAffiliateUrl());
  return (
    <ProsePage
      eyebrow="Legal"
      title="Terms of Service"
      updated="20 November 2026"
      intro="These terms are the agreement between you and the operator of RankbyAI. They are written in plain English. By creating an account or buying, you agree to them."
    >
      <h2>1. Who we are</h2>
      <p>
        RankbyAI (rankbyai.live) is operated by <LegalEntity />
        <LegalKvk />, <LegalAddress />. In these terms, &ldquo;we&rdquo; and &ldquo;us&rdquo; mean that operator. You can reach us at <LegalEmail />.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be 18 or older.</li>
        <li>RankbyAI is built for business use, such as agencies and freelancers who do local marketing.</li>
        <li>Sign in with a Google account that is yours. We use its verified email address for your account.</li>
        <li>You are responsible for what happens in your workspace, including what your team members do.</li>
      </ul>

      <h2>3. The lifetime plan</h2>
      <p>
        <strong>One payment.</strong> You pay once. There is no subscription and nothing to cancel.
      </p>
      <p>
        <strong>What &ldquo;lifetime&rdquo; means.</strong> Your workspace keeps access for as long as RankbyAI operates. It does not mean your lifetime or ours. Section 12 says what happens if we
        ever shut down.
      </p>
      <p>
        <strong>What is included.</strong> The features listed in the <Link href="/#pricing">pricing section</Link> when you buy, plus future updates to those features. New, separate modules that
        we build later may be sold as add-ons.
      </p>
      <p>
        <strong>Early access.</strong> While RankbyAI is in early access, the site shows which modules are live and when the others are due. The {REFUND_DAYS}-day refund applies either way.
      </p>
      <p>
        <strong>Fair-use limits.</strong> Each workspace can hold {FAIR_USE.businesses.toLocaleString("en-US")} businesses, {FAIR_USE.scheduledQueries.toLocaleString("en-US")} scheduled queries and{" "}
        {FAIR_USE.apiKeys} RankbyAI API keys. We set no cap on scans that run on your own vendor keys, apart from technical limits on the size of a single scan and on how many scans run at once.
        The limits published when you buy are never reduced for you.
      </p>
      <h3>Price</h3>
      <ul>
        <li>
          The price follows a public ladder. It starts at {usd(DEFAULT_LADDER.basePriceCents)} and rises {usd(DEFAULT_LADDER.stepCents)} after every {DEFAULT_LADDER.seatsPerStep} sales.
        </li>
        <li>A live sales counter sets the price. A timer does not.</li>
        <li>A refunded seat still counts as sold. A refund never lowers the price.</li>
        <li>You pay the price shown when you start checkout. If the price moved after you loaded the page, we ask you to confirm the new price before you pay.</li>
        <li>The lifetime deal closes on {formatClosesAt(DEFAULT_LADDER.closesAt)}. After that the lifetime plan can no longer be bought.</li>
      </ul>

      <h2>4. Your API keys and data costs</h2>
      <p>RankbyAI is bring-your-own-key software. You connect your own accounts at DataForSEO, OpenAI, Perplexity and Google (Gemini).</p>
      <ul>
        <li>
          <strong>The vendors bill you directly</strong> at their own rates. Those rates can change at any time. That is between you and the vendor.
        </li>
        <li>
          <strong>We do not mark up those costs and we do not receive them.</strong>
        </li>
        <li>
          <strong>Estimates are estimates.</strong> The app shows an estimated cost before a scan and the actual cost after. The estimate comes from the vendors&rsquo; published prices and can
          differ from what the vendor charges you.
        </li>
        <li>
          <strong>You follow each vendor&rsquo;s terms.</strong> You are responsible for your vendor accounts, their billing and their usage rules.
        </li>
        <li>
          <strong>How we handle your keys.</strong> Keys are encrypted with AES-256-GCM before they are stored. They are write-only: no screen or endpoint ever shows a saved key again. They are used
          only from our servers to run the scans you ask for. You can replace or delete a key at any time.
        </li>
      </ul>
      {affiliate ? (
        <p>
          <strong>Referral link.</strong> Our sign-up link to DataForSEO is a referral link. If you open an account through it, DataForSEO may pay us a commission.
        </p>
      ) : null}

      <h2>5. Included scan credits</h2>
      <p>If you prefer not to manage keys, you can buy packs of included scans. These run on our keys.</p>
      <ul>
        <li>
          Packs: {PACKS.pack_25.credits} credits for {usd(PACKS.pack_25.priceCents)}, or {PACKS.pack_100.credits} credits for {usd(PACKS.pack_100.priceCents)}. Each is a one-time payment.
        </li>
        <li>Packs need a workspace on the lifetime plan.</li>
        <li>
          What a credit buys: a 3×3 AI grid on three engines, a Maps grid up to {largestOneCreditMapsGrid()}, or an audit costs {CREDIT_COST.ai_grid_3} credit. A 5×5 AI grid costs {CREDIT_COST.ai_grid_5} credits.
          {largerMapsGridsText() ? ` ${largerMapsGridsText().replace(/^./, (c) => c.toUpperCase())}.` : ""} A prospect report costs {CREDIT_COST.prospect_report} credits. Credits for a grid are
          counted on the points that are checked: grid points you skip are not counted.
        </li>
        <li>
          <strong>Credits never expire.</strong>
        </li>
        <li>
          <strong>Credits are non-transferable.</strong> They stay with the workspace that bought them and cannot be sold, moved or swapped for cash.
        </li>
        <li>
          <strong>Refunds.</strong> The unused part of a pack is refundable within {REFUND_DAYS} days of purchase. Used credits are not refundable.
        </li>
      </ul>

      <h2>6. The free check</h2>
      <p>
        The free check is a small sample report that needs no account and no purchase. It is limited to one per person (one per browser and per device), three per network per day, and one
        check of the same business per day. We run it on our own keys within a daily and a monthly budget; when a budget is used up, checks wait until there is room again and nothing is
        charged. The result is shown only to the browser that ran the check. We may refuse or pause free checks to stop abuse.
      </p>

      <h2>7. Payment and tax</h2>
      <ul>
        <li>Prices are in US dollars and are one-time payments.</li>
        <li>
          <strong>Prices exclude tax.</strong> Tax such as VAT or sales tax is calculated at checkout with Stripe Tax, based on where you are. You see the total before you pay.
        </li>
        <li>Businesses can add a tax ID at checkout.</li>
        <li>
          Stripe processes the payment. The seller is <LegalEntity />. Stripe is not the merchant of record.
        </li>
        <li>We never see or store your full card number.</li>
      </ul>

      <h2>8. Refunds</h2>
      <p>
        You can get a refund within {REFUND_DAYS} days of purchase, no questions asked. The full rules are on the <Link href="/refunds">refund policy</Link> page, which is part of these terms.
      </p>

      <h2>9. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          <strong>Misrepresent businesses.</strong> Do not change, fake or present results in a misleading way, and do not pretend to act for a business that you do not represent.
        </li>
        <li>
          <strong>Resell access.</strong> Do not resell, rent or sublicense access to RankbyAI itself. Sharing reports with your own clients and prospects is fine, and is what the product is for.
        </li>
        <li>
          <strong>Send spam.</strong> RankbyAI does not send email for you and does not collect email addresses of the businesses you scan. What you do with reports and exports is your own outreach.
        </li>
        <li>Break the law, break a vendor&rsquo;s terms, or try to get around limits, security or access controls.</li>
      </ul>
      <p>
        <strong>Your outreach is your responsibility.</strong> You must make sure your outreach follows the rules that apply to it, such as CAN-SPAM in the United States, PECR in the United Kingdom
        and the GDPR.
      </p>
      <p>If you break these rules, we may suspend or close your account.</p>

      <h2>10. AI results and no guarantee</h2>
      <p>{AI_DISCLAIMER_TEXT}</p>
      <ul>
        <li>We collect results only through official APIs. We do not scrape the consumer apps or Google.</li>
        <li>Every result is a sample taken at a fixed point on a given date. It is not a promise of what any one person will see.</li>
        <li>
          <strong>We do not guarantee any ranking, AI mention, lead or business result.</strong> Audit scores and suggested fixes are guidance. We do not edit listings or websites for you.
        </li>
        <li>{NOT_AFFILIATED} Names and trademarks belong to their owners.</li>
      </ul>
      <p>
        More detail is on the <Link href="/disclaimer">disclaimer</Link> page.
      </p>

      <h2>11. Liability</h2>
      <p>We provide RankbyAI with reasonable care, but we cannot promise that it will always be available or free of errors. The data comes from third-party APIs that we do not control.</p>
      <p>
        <strong>Our total liability to you is capped at the amount you paid us.</strong> We are not liable for indirect losses such as lost profit, lost clients or lost data, or for what the API
        vendors charge you. Nothing in these terms limits liability that cannot be limited by law.
      </p>

      <h2>12. If we shut down</h2>
      <p>
        If we ever stop operating RankbyAI, we will give you at least 60 days&rsquo; notice and a way to export your data during that time.
      </p>

      <h2>13. Changes to these terms</h2>
      <p>
        We may update these terms. The new version is posted on this page with a new date. A change never reduces the limits that were published when you bought the lifetime plan.
      </p>

      <h2>14. Law</h2>
      <p>
        Dutch law applies to these terms. If you are a consumer, you keep the rights that the mandatory consumer law of your own country gives you. Nothing in these terms takes those rights away.
      </p>

      <h2>15. Contact</h2>
      <p>
        Questions about these terms? Email <LegalEmail />. See also the <Link href="/privacy">privacy policy</Link>, the <Link href="/refunds">refund policy</Link> and the{" "}
        <Link href="/disclaimer">disclaimer</Link>.
      </p>
    </ProsePage>
  );
}

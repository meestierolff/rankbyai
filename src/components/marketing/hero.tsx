"use client";

import Link from "next/link";
import { CtaLink, LiveDot } from "@/components/brand/primitives";
import { usd0, usdSmart } from "@/lib/cost/estimate";
import { fmtPrice } from "@/lib/ladder";
import { COMPETITORS, COMPETITOR_PRICES_DATE, REFUND_DAYS } from "@/lib/pricing-constants";
import { BUY_HREF, CtaLabel, useOffer } from "./offer-context";

/** Hero. `scenarioYearUsd` is the [estimate] for the published comparison scenario (computed on the server). */
export function Hero({ scenarioYearUsd }: { scenarioYearUsd: number }) {
  const { offer } = useOffer();
  const data = usd0(scenarioYearUsd);
  return (
    <section id="top" className="container-page flex flex-col items-center gap-7 pt-[clamp(72px,9vw,128px)] pb-[clamp(48px,6vw,80px)] text-center">
      {offer?.open ? (
        <div className="flex items-center gap-[10px] rounded-full border border-border bg-bg-alt px-4 py-2 text-[14px] text-muted-foreground">
          <LiveDot />
          <span className="font-semibold whitespace-nowrap text-fg">
            {offer.seatsLeftAtCurrentPrice} left at {fmtPrice(offer.currentPriceUsd)}
          </span>
          <span aria-hidden>·</span>
          <span>then {fmtPrice(offer.nextPriceUsd)}</span>
        </div>
      ) : null}

      <h1 className="text-h1 m-0 max-w-[980px]">AI visibility software you pay for once.</h1>

      <p className="m-0 max-w-[760px] text-[clamp(17px,1.5vw,21px)] leading-[1.55] text-pretty text-muted-foreground">
        See where ChatGPT, Perplexity and Gemini recommend your clients, point by point on a map, next to their Google Maps rank.{" "}
        <span className="text-fg">Pay once.</span> Scans run on your own API keys at cost.
      </p>

      <a
        href="#compare"
        className="flex w-full max-w-[900px] flex-col gap-[18px] rounded-[18px] border border-border bg-bg-alt px-[clamp(16px,3vw,32px)] py-[22px] no-underline transition-colors hover:border-border-strong"
      >
        <span className="text-[14px] text-dim">
          A year of monthly AI checks for 10 clients, 3 prompts each, plus a monthly Maps grid
        </span>
        <span className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-[18px]">
          <span className="flex flex-col items-center gap-[6px]">
            <span className="font-mono text-[clamp(28px,3.2vw,38px)] leading-none font-semibold text-[#8a8a8a]">
              {usdSmart(COMPETITORS.brightlocal.yearUsd)}
            </span>
            <span className="text-[14px] text-muted-foreground">BrightLocal Track, 6–10 locations, billed yearly</span>
          </span>
          <span className="flex flex-col items-center gap-[6px]">
            <span className="font-mono text-[clamp(28px,3.2vw,38px)] leading-none font-semibold text-[#8a8a8a]">
              {usdSmart(COMPETITORS.localfalcon.yearUsd)}
            </span>
            <span className="text-[14px] text-muted-foreground">Local Falcon Starter, billed yearly</span>
          </span>
          <span className="flex flex-col items-center gap-[6px]">
            <span className="font-mono text-[clamp(28px,3.2vw,38px)] leading-none font-semibold text-g1">
              ≈ {data}
              {offer ? <span className="text-fg"> + {fmtPrice(offer.currentPriceUsd)}</span> : null}
            </span>
            <span className="text-[14px] text-fg">
              RankbyAI on your own keys{offer ? ", plus the one-time price" : ""} [estimate]
            </span>
          </span>
        </span>
        <span className="text-[13px] text-dim">
          Competitor prices from their public pricing pages, {COMPETITOR_PRICES_DATE}.{" "}
          <span className="text-muted-foreground underline underline-offset-[3px]">How we calculated this</span>
        </span>
      </a>

      <CtaLink href={BUY_HREF} size="lg">
        <CtaLabel label="Get lifetime access" />
      </CtaLink>
      <span className="text-[14px] text-dim">
        One payment. No monthly fee. No expiring credits. {REFUND_DAYS}-day refund, no questions.
      </span>
      <Link href="#tour" className="font-medium text-muted-foreground no-underline transition-colors hover:text-fg">
        See how it works ↓
      </Link>
    </section>
  );
}

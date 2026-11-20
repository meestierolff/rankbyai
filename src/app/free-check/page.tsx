import type { Metadata } from "next";
import { io } from "next/cache";
import { cookies } from "next/headers";
import Link from "next/link";
import { HackathonTracker } from "@/components/hackathon-tracker";
import { FreeCheck } from "@/components/marketing/free-check";
import { creamClass } from "@/components/marketing/lp";
import { PageShell } from "@/components/marketing/page-shell";
import { ReportBody } from "@/components/report/report-body";
import { freeCheckOpen } from "@/lib/availability";
import { isDatabaseConfigured } from "@/lib/db/clients";
import { legalEnv, miscEnv, publicEnv } from "@/lib/env";
import { CHECK_COOKIE, loadPublicCheck, type PublicCheckState } from "@/lib/free-check-public";
import { fmtPrice, formatClosesAt } from "@/lib/ladder";
import { getOfferCached } from "@/lib/offer";
import { CheckRunner } from "./check-runner";
import { FreeCheckNext, type OfferLine } from "./result-panel";
import { CheckShown } from "./shown";

/**
 * The public free check (no account). One address, five states, all decided on the server from the
 * check cookie: no check yet (the form), running, waiting for the budget, failed (the form again,
 * with the reason), and the result. A result is private to the browser that ran it, so this page is
 * never indexed and never cached; the homepage section stays the public entry.
 */
export const metadata: Metadata = {
  title: "Free AI visibility check",
  description: "Check one point free: whether ChatGPT, Perplexity and Gemini name a business at its own location, next to its Google Maps rank there.",
  robots: { index: false, follow: true, nocache: true },
  referrer: "same-origin",
};

// A blocking route on purpose: the state depends on the visitor's cookie.
export const instant = false;

async function offerLine(): Promise<OfferLine> {
  const result = await getOfferCached();
  if (!result.available) return { cta: "See pricing", note: "One payment for the software; scans at cost on your own API keys." };
  const o = result.offer;
  return o.open
    ? {
        cta: `Get lifetime access: ${fmtPrice(o.currentPriceUsd)} once`,
        note: `Lifetime price today ${fmtPrice(o.currentPriceUsd)}. It rises ${fmtPrice(o.stepUsd)} after every ${o.seatsPerStep} sales, and the lifetime deal closes ${formatClosesAt(o.closesAt)}. 14-day refund.`,
      }
    : { cta: "See pricing", note: "The lifetime deal has closed. Current plans are on the pricing page." };
}

export default async function FreeCheckPage() {
  await io();
  const cookie = (await cookies()).get(CHECK_COOKIE)?.value ?? null;
  let state: PublicCheckState = { kind: "none" };
  if (isDatabaseConfigured()) {
    try {
      state = await loadPublicCheck(cookie);
    } catch {
      state = { kind: "none" };
    }
  }

  if (state.kind === "done") {
    return (
      <>
        <HackathonTracker />
        <CheckShown />
        <ReportBody
          view={state.view}
          pdfHref={null}
          siteUrl={publicEnv.siteUrl}
          nextSteps={<FreeCheckNext offer={await offerLine()} emailGiven={state.emailGiven} operator={legalEnv.entityName() ? `RankbyAI (operated by ${legalEnv.entityName()})` : "RankbyAI"} contactEmail={legalEnv.email()} />}
        />
      </>
    );
  }

  return (
    <>
      <HackathonTracker />
      <PageShell>
        {state.kind === "pending" ? (
          <div className="container-lp flex min-h-[60dvh] items-center py-20 text-lp-fg">
            <CheckRunner key={state.attempt} businessName={state.businessName} />
          </div>
        ) : state.kind === "waiting" ? (
          <div className="container-lp flex min-h-[60dvh] items-center py-20 text-lp-fg">
            <div className="flex max-w-[620px] flex-col items-start gap-4">
              <h1 className="m-0 text-[clamp(28px,3.6vw,40px)] leading-[1.08] font-semibold tracking-[-0.04em] text-balance">Your check of {state.businessName} is waiting.</h1>
              <p role="status" className="m-0 text-[16px] leading-[1.6] text-lp-muted">
                {state.message} Nothing was charged and nothing ran. Free checks run on our own API keys within a fixed budget, so when it is used up we stop instead of spending more.
              </p>
              <Link href="/pricing" className={creamClass("md")}><span>See what the full product does</span><span aria-hidden>→</span></Link>
            </div>
          </div>
        ) : (
          <FreeCheck turnstileSiteKey={miscEnv.turnstileSiteKey()} open={freeCheckOpen()} headingLevel={1} notice={state.kind === "failed" ? state.message : undefined} />
        )}
      </PageShell>
    </>
  );
}

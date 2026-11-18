"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usd0, usdSmart } from "@/lib/cost/estimate";
import { fmtPrice } from "@/lib/ladder";
import { COMPETITORS, COMPETITOR_PRICES_DATE, REFUND_DAYS, SCENARIO } from "@/lib/pricing-constants";
import { CreamLink } from "./lp";
import { useReducedMotion } from "./lp-motion";
import { BUY_HREF, CtaLabel, useOffer } from "./offer-context";

/** The four drifting ellipses of the ember glow: position, size, gradient and loop. */
const BLOBS = [
  { left: "50%", top: "72%", w: 1800, h: 560, bg: "radial-gradient(closest-side,rgba(255,128,40,0.95),rgba(255,105,25,0.6) 55%,rgba(255,90,20,0) 100%)", from: "translate(-4%,0) scale(1)", to: "translate(4%,-6%) scale(1.06)", ms: 12000 },
  { left: "26%", top: "64%", w: 780, h: 380, bg: "radial-gradient(closest-side,rgba(255,196,130,0.9),rgba(255,160,80,0) 100%)", from: "translate(-6%,4%)", to: "translate(20%,-4%)", ms: 9000 },
  { left: "74%", top: "86%", w: 960, h: 440, bg: "radial-gradient(closest-side,rgba(236,74,16,0.95),rgba(236,74,16,0) 100%)", from: "translate(6%,0)", to: "translate(-16%,-10%)", ms: 11000 },
  { left: "56%", top: "50%", w: 1200, h: 340, bg: "radial-gradient(closest-side,#000,rgba(0,0,0,0.85) 45%,rgba(0,0,0,0) 100%)", from: "translate(-12%,2%) scale(1)", to: "translate(10%,-6%) scale(1.1)", ms: 10000 },
] as const;

/** Decorative background: an animated, grainy ember glow. Purely visual, hidden from assistive tech. */
function HeroGlow() {
  const glowRef = useRef<HTMLDivElement>(null);
  const grainRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  // Grain: 180px of random grey noise, generated once in the browser (never during render).
  useEffect(() => {
    const el = grainRef.current;
    if (!el) return;
    const c = document.createElement("canvas");
    c.width = c.height = 180;
    const x = c.getContext("2d");
    if (!x) return;
    const img = x.createImageData(180, 180);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    el.style.backgroundImage = `url(${c.toDataURL()})`;
  }, []);

  useEffect(() => {
    const root = glowRef.current;
    if (!root || reduced || typeof root.animate !== "function") return;
    const anims = Array.from(root.querySelectorAll<HTMLElement>("[data-blob]")).map((el, i) =>
      el.animate([{ transform: BLOBS[i].from }, { transform: BLOBS[i].to }], { duration: BLOBS[i].ms, direction: "alternate", iterations: Infinity, easing: "ease-in-out" }),
    );
    return () => anims.forEach((a) => a.cancel());
  }, [reduced]);

  return (
    <>
      <div ref={glowRef} aria-hidden className="pointer-events-none absolute inset-0 -z-[2]">
        {BLOBS.map((b, i) => (
          <div
            key={i}
            data-blob
            className="absolute rounded-full"
            style={{ left: b.left, top: b.top, width: b.w, height: b.h, margin: `${-b.h / 2}px 0 0 ${-b.w / 2}px`, background: b.bg, transform: b.from }}
          />
        ))}
        <div className="absolute inset-x-0 top-0 h-[300px] bg-[linear-gradient(#000_30%,rgba(0,0,0,0))]" />
      </div>
      <div ref={grainRef} aria-hidden className="pointer-events-none absolute inset-0 -z-[1] bg-[length:180px_180px] opacity-65 mix-blend-overlay" />
    </>
  );
}

const STRUCK = "font-mono text-[clamp(30px,3.6vw,42px)] leading-none font-semibold text-[#8a8a8a] line-through decoration-lp-strike decoration-[3px]";

/**
 * Hero. The offer is the first thing a visitor sees: two competitor list prices struck through
 * and ours next to them, for one published scenario. `scenarioYearUsd` is the data cost of that
 * scenario [estimate], computed on the server from the same constant the compare table uses.
 */
export function Hero({ scenarioYearUsd }: { scenarioYearUsd: number }) {
  const { offer } = useOffer();
  const priced = offer?.open ? offer : null;
  return (
    <section id="top" className="relative isolate flex flex-col items-center overflow-hidden bg-lp-bg px-6 pt-10 pb-16 text-lp-fg">
      <HeroGlow />

      {priced ? (
        <div className="flex items-center gap-2 rounded-full border border-[#2a2a2a] bg-[rgba(0,0,0,0.6)] px-[13px] py-[6px] font-mono text-[12px] text-[#bdbdbd]">
          <span aria-hidden className="size-[6px] rounded-full bg-lp-accent shadow-[0_0_10px_var(--lp-accent)]" />
          {priced.seatsLeftAtCurrentPrice} left at {fmtPrice(priced.currentPriceUsd)} · then {fmtPrice(priced.nextPriceUsd)}
        </div>
      ) : null}

      <h1 className="font-display m-0 mt-[22px] max-w-[1040px] text-center text-[clamp(36px,5.4vw,74px)] leading-[0.98] font-extrabold tracking-[-0.025em] text-balance">
        AI visibility you pay for once.
      </h1>

      <p className="m-0 mt-5 max-w-[660px] text-center text-[clamp(16px,1.6vw,18px)] leading-[1.55] text-pretty text-[#cfc8bf]">
        See where ChatGPT, Perplexity and Gemini recommend your clients, point by point on a map, next to their Google Maps rank.{" "}
        <span className="text-lp-fg">Pay once.</span> Scans run on your own API keys at cost.
      </p>

      <a
        href="#compare"
        className="mt-[30px] block w-full max-w-[880px] rounded-[20px] border border-[rgba(255,255,255,0.12)] bg-[rgba(10,8,7,0.82)] px-[clamp(16px,3vw,32px)] pt-[20px] pb-[14px] text-lp-fg no-underline shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-[16px] transition-colors hover:border-[rgba(255,255,255,0.24)]"
      >
        <div className="text-center text-[clamp(13px,1.4vw,15px)] leading-normal text-[#a3a3a3]">{SCENARIO.headline}</div>
        <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] items-end gap-[18px]">
          <div className="text-center">
            <div className={STRUCK}>{usdSmart(COMPETITORS.brightlocal.yearUsd)}</div>
            <div className="mt-[10px] text-[14.5px] text-[#9a9a9a]">BrightLocal Track</div>
          </div>
          <div className="text-center">
            <div className={STRUCK}>{usdSmart(COMPETITORS.localfalcon.yearUsd)}</div>
            <div className="mt-[10px] text-[14.5px] text-[#9a9a9a]">Local Falcon Starter</div>
          </div>
          <div className="text-center">
            <div className="font-mono text-[clamp(34px,4.2vw,50px)] leading-none font-semibold text-lp-ours">
              <span className="text-[0.6em] text-lp-ours-dim">≈ </span>
              {usd0((priced ? priced.currentPriceUsd : 0) + scenarioYearUsd)}
            </div>
            <div className="mt-[10px] text-[14.5px] text-lp-fg">
              {priced ? "RankbyAI, on your own keys" : "RankbyAI data on your own keys, plus the one-time price"}
            </div>
          </div>
        </div>
        {/* Required with every competitor price: its source and date. Also says what our number is made of. */}
        <div className="mt-[10px] text-center text-[12px] leading-[1.4] text-lp-dim">
          Yearly list prices from their pricing pages, {COMPETITOR_PRICES_DATE}.
          {priced ? ` Ours: ${fmtPrice(priced.currentPriceUsd)} once plus ≈ ${usd0(scenarioYearUsd)} of Maps data [estimate].` : " Ours is an estimate."}{" "}
          <span className="underline underline-offset-[3px]">How we calculated this</span>
        </div>
      </a>

      <CreamLink href={BUY_HREF} size="lg" className="mt-[26px]">
        <CtaLabel label="Get lifetime access" />
      </CreamLink>
      <div className="mt-[14px] text-center text-[14px] text-[#d9cfc4]">
        One payment. No monthly fee. No expiring credits. {REFUND_DAYS}-day refund, no questions.
      </div>
      <div className="mt-[18px] flex flex-wrap justify-center gap-x-[26px] gap-y-2">
        <Link href="#tour" className="text-[15.5px] font-medium text-[#cfc8bf] no-underline transition-colors hover:text-lp-fg">See how it works ↓</Link>
        <Link href="#free-check" className="text-[15.5px] font-medium text-[#a39b92] no-underline transition-colors hover:text-lp-fg">Or run a free check ↓</Link>
      </div>
    </section>
  );
}

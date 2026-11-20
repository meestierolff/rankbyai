"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";
import { AI_DISCLAIMER_TEXT } from "@/lib/copy";
import { Bezel } from "./lp";
import { useOnScreen, useReducedMotion } from "./lp-motion";

const SRC = "/demo/rankbyai-demo.mp4";
const POSTER = "/demo/rankbyai-demo-poster.jpg";

/**
 * The product demo right under the hero: the target of "See how it works ↓" (#tour).
 * Real screens of the app on one real scan (South Austin Dentist, Nov 18, 2026), edited into a
 * 77-second film without sound. It plays muted while on screen and pauses when scrolled away;
 * under reduced motion it waits for the viewer to press play. preload="none" keeps the 6 MB file
 * off the network until it plays.
 */
export function DemoVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const onScreen = useOnScreen(ref);
  const reduced = useReducedMotion();
  const touched = useRef(false);
  // Autoplay is not an interaction: count only the viewer's own pointer or key input on the player.
  const onTouch = () => {
    if (touched.current) return;
    touched.current = true;
    track("demo_interacted", { step: "video" });
  };

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (!onScreen) {
      video.pause();
      return;
    }
    // Read the media query here as well: right after hydration `reduced` can still hold its
    // initial false when the observer reports the video on screen (seen in Chrome).
    if (reduced || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Browsers may refuse autoplay (data saver, low power); the poster and controls stay usable.
    video.play().catch(() => {});
  }, [onScreen, reduced]);

  return (
    <section id="tour" aria-labelledby="demo-video-title" className="relative px-6 pt-6 pb-8 text-lp-fg">
      <div className="mx-auto w-full max-w-(--lp-container-wide)">
        <h2 id="demo-video-title" className="m-0 mb-4 text-center font-mono text-[12px] font-normal tracking-[0.16em] text-lp-accent-text uppercase">
          See how it works · one real scan, start to finish
        </h2>
        <Bezel warm style={{ boxShadow: "var(--lp-shadow-bezel-lg)" }}>
          <video
            ref={ref}
            className="block aspect-video h-auto w-full bg-black"
            src={SRC}
            poster={POSTER}
            width={1920}
            height={1080}
            muted
            loop
            playsInline
            controls
            preload="none"
            aria-describedby="demo-video-summary"
            onPointerDown={onTouch}
            onKeyDown={onTouch}
          />
        </Bezel>
        <p className="m-0 mt-3 text-center text-[12.5px] leading-[1.5] text-lp-dim">
          Real screens from the app, on a scan from Nov 18, 2026. {AI_DISCLAIMER_TEXT}
        </p>
        <div id="demo-video-summary" className="sr-only">
          The video has no sound. Someone in Austin asks ChatGPT who the best dentists near them are; at that spot the answer names
          four practices and not South Austin Dentist, which ChatGPT names first at its own address. Then the app: an AI check asks
          ChatGPT, Perplexity and Gemini from 9 spots (named at 7 of 9), shows who AI recommends where the business is missing, its
          Google Maps rank on a 5 by 5 grid (top 3 at 6 of 25 spots), an audit that ranks the fixes P0 to P3 with evidence, a Fix Kit,
          and a live report to send the client.
        </div>
      </div>
    </section>
  );
}

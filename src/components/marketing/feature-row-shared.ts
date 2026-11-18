"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { fitCanvas, useAnimationFrame, useOnScreen, useReducedMotion } from "@/components/marketing/lp-motion";

/*
 * Shared plumbing of the three feature-row visuals (radar, key router, terminal).
 * Each visual keeps its own clock, so an animation resumes where it stopped after it was off screen.
 */

/** Panel colour behind the canvases (the bezel's inner panel, --lp-frame-inner). */
export const PANEL_BG = "#0a0a0a";

export interface Clock {
  /** Timestamp of the previous frame, 0 when the loop is not running. */
  last: number;
  /** Milliseconds the animation has actually played. */
  elapsed: number;
}

/** Advances `clock` by one frame and returns the played time. A long gap (a pause) adds nothing. */
export function tick(clock: Clock, now: number): number {
  const dt = clock.last ? now - clock.last : 0;
  clock.last = now;
  if (dt > 0 && dt <= 250) clock.elapsed += dt;
  return clock.elapsed;
}

export interface Surface {
  ctx: CanvasRenderingContext2D;
  /** CSS pixels. */
  width: number;
  height: number;
  /** Font stacks for `ctx.font`, read from the next/font variables. */
  mono: string;
  sans: string;
}

/** Draws one frame. `elapsedMs` is null for the still frame (reduced motion, or off screen). */
export type Paint = (surface: Surface, elapsedMs: number | null) => void;

/**
 * One canvas, one requestAnimationFrame loop. The loop runs only while the canvas is on screen and
 * motion is allowed; otherwise `paint` gets one still frame, repainted when the canvas is resized or
 * the web fonts arrive.
 */
export function useFeatureCanvas(paint: Paint): RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const store = useRef<{ surface: Surface | null; stale: boolean; dpr: number; clock: Clock }>({ surface: null, stale: true, dpr: 0, clock: { last: 0, elapsed: 0 } });
  const paintRef = useRef(paint);
  const reduced = useReducedMotion();
  const visible = useOnScreen(canvasRef);
  const active = visible && !reduced;
  const activeRef = useRef(active);
  useEffect(() => {
    paintRef.current = paint;
    activeRef.current = active;
  });

  /** The cleared drawing surface, measured again only after a resize. */
  const surface = useCallback((): Surface | null => {
    const st = store.current;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    // A zoom, or a move to another screen, changes the pixel ratio without resizing the canvas.
    if (st.stale || !st.surface || st.dpr !== window.devicePixelRatio) {
      const fit = fitCanvas(canvas);
      if (!fit) return null;
      st.dpr = window.devicePixelRatio;
      const css = getComputedStyle(canvas);
      const mono = css.getPropertyValue("--font-geist-mono").trim();
      const sans = css.getPropertyValue("--font-geist-sans").trim();
      st.surface = {
        ...fit,
        mono: `${mono ? `${mono}, ` : ""}ui-monospace, monospace`,
        sans: `${sans ? `${sans}, ` : ""}system-ui, sans-serif`,
      };
      st.stale = false;
    }
    st.surface.ctx.clearRect(0, 0, st.surface.width, st.surface.height);
    return st.surface;
  }, []);

  const still = useCallback(() => {
    store.current.clock.last = 0;
    const s = surface();
    if (s) paintRef.current(s, null);
  }, [surface]);

  const frame = useCallback(
    (now: number) => {
      const elapsed = tick(store.current.clock, now);
      const s = surface();
      if (s) paintRef.current(s, elapsed);
    },
    [surface],
  );

  useAnimationFrame(frame, active, still);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let alive = true;
    const refit = () => {
      if (!alive) return;
      store.current.stale = true;
      if (!activeRef.current) still();
    };
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(refit);
    ro?.observe(canvas);
    void document.fonts?.ready.then(refit);
    return () => {
      alive = false;
      ro?.disconnect();
    };
  }, [still]);

  return canvasRef;
}

/** Rounded rectangle path, with a plain rectangle where `roundRect` is missing. */
export function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

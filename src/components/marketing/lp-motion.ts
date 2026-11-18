"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/*
 * Motion helpers for the landing page's animated visuals.
 * Rules they enforce: nothing animates under "prefers-reduced-motion", nothing animates while
 * off screen, and a frame is never driven through React state.
 */

/** True when the visitor asked for reduced motion. False on the server and on the first client render. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Whether `ref` is on screen (IntersectionObserver). */
export function useOnScreen(ref: RefObject<Element | null>, rootMargin = "80px"): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return visible;
}

/**
 * Sizes a canvas to its CSS box at the device pixel ratio (capped at 2) and returns a context
 * scaled so drawing code works in CSS pixels. Returns null when the canvas has no size yet.
 */
export function fitCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; width: number; height: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

/**
 * Runs `draw(nowMs)` on every animation frame while `active` is true. `draw` is kept in a ref, so
 * it may close over fresh props without restarting the loop. When `active` is false and
 * `drawStatic` is given, it is called once (the still frame for reduced motion).
 */
export function useAnimationFrame(draw: (now: number) => void, active: boolean, drawStatic?: () => void) {
  const drawRef = useRef(draw);
  const staticRef = useRef(drawStatic);
  useEffect(() => {
    drawRef.current = draw;
    staticRef.current = drawStatic;
  });
  useEffect(() => {
    if (!active) {
      staticRef.current?.();
      return;
    }
    let id = 0;
    const loop = (now: number) => {
      drawRef.current(now);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);
}

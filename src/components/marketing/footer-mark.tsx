"use client";

import { useRef } from "react";
import { fitCanvas, useAnimationFrame, useOnScreen, useReducedMotion } from "./lp-motion";

/** Dots in the order a radar sweep passes them: centre, then N, NE, E, SE, S, SW, W, NW. */
const ORDER = [4, 1, 2, 5, 8, 7, 6, 3, 0];
const CYCLE_MS = 3600;

function draw(canvas: HTMLCanvasElement, phase: number | null) {
  const fit = fitCanvas(canvas);
  if (!fit) return;
  const { ctx, width } = fit;
  ctx.clearRect(0, 0, width, width);
  const gap = width / 3;
  const r = gap * 0.36;
  for (let i = 0; i < 9; i++) {
    const x = gap / 2 + (i % 3) * gap;
    const y = gap / 2 + Math.floor(i / 3) * gap;
    let b = 0;
    if (i === 4) b = 1;
    else if (phase !== null) b = Math.max(0, 1 - ((phase - ORDER.indexOf(i) + 9) % 9) / 2.2);
    const mix = (from: number, to: number) => Math.round(from + (to - from) * b);
    ctx.fillStyle = `rgb(${mix(242, 255)},${mix(240, 122)},${mix(236, 26)})`;
    ctx.beginPath();
    ctx.arc(x, y, i === 4 ? r * 1.12 : r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The giant 3×3 mark in the footer. The centre dot is orange; the others flash in radar order. */
export function FooterMark() {
  const ref = useRef<HTMLCanvasElement>(null);
  const visible = useOnScreen(ref);
  const reduced = useReducedMotion();
  useAnimationFrame(
    (now) => {
      if (ref.current) draw(ref.current, ((now % CYCLE_MS) / CYCLE_MS) * 9);
    },
    visible && !reduced,
    () => {
      if (ref.current) draw(ref.current, null);
    },
  );
  return <canvas ref={ref} aria-hidden className="block size-[12vw] flex-none" />;
}

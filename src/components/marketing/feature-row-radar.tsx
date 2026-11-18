"use client";

import { useRef } from "react";
import { AiDisclaimer } from "@/components/brand/primitives";
import { roundedRect, useFeatureCanvas, type Surface } from "@/components/marketing/feature-row-shared";
import { Bezel, BezelHeader, LpSampleTag } from "@/components/marketing/lp";
import { ENGINE_LABEL } from "@/lib/pricing-constants";
import { AI_N, SAMPLE, SAMPLE_ENGINES, mentionCount, sampleAiGrid } from "@/lib/sample-data";

/*
 * Feature row A: a radar sweep that reveals a 5×5 AI grid, one engine after the other.
 * All positions come from sampleAiGrid() (lib/sample-data); nothing here is a measured result.
 */

const POINTS = AI_N * AI_N;
const CENTRE = (AI_N - 1) / 2;
const GRIDS = SAMPLE_ENGINES.map((e) => {
  const cells = sampleAiGrid(e.key);
  return { key: e.key, label: ENGINE_LABEL[e.key].short, positions: cells.map((c) => c.position), named: mentionCount(cells) };
});
const pct = (named: number) => `${Math.round((named / POINTS) * 100)}%`;
const QUERY = `“best ${SAMPLE.service} near me”`;
const CITY = SAMPLE.city.split(",")[0];

/** One engine's turn, the sweep inside it, the fade at its end, and the moment shown as the still frame. */
const ENGINE_MS = 5800;
const SWEEP_MS = 3800;
const FADE_MS = 500;
const STILL_MS = 4600;
const TAU = Math.PI * 2;

/** Cell colours of the radar (handoff, row A): solid orange for positions 1–3, tinted for 4–5. */
function cellStyle(position: number | null) {
  if (position === null) return { bg: "#101010", border: "#232323", fg: "#4d4d4d", label: "–" };
  if (position <= 3) return { bg: "#ff7a1a", border: "#ff7a1a", fg: "#140800", label: String(position) };
  return { bg: "rgba(255,122,26,0.2)", border: "rgba(255,122,26,0.55)", fg: "#ffb27a", label: String(position) };
}

/** Paints one frame and returns which engine is showing and how many of its named points are revealed. */
function paintRadar({ ctx, width: W, height: H, mono }: Surface, elapsedMs: number | null): { engine: number; named: number } {
  const t = elapsedMs === null ? STILL_MS : elapsedMs % (ENGINE_MS * GRIDS.length);
  const engine = Math.min(GRIDS.length - 1, Math.floor(t / ENGINE_MS));
  const local = t - engine * ENGINE_MS;

  const top = 56;
  const bottom = 36;
  const avail = H - top - bottom;
  const size = Math.min(avail - 20, W - 70);
  const step = size / (AI_N - 1);
  const cx = W / 2;
  const cy = top + avail / 2;
  const cell = Math.min(30, step * 0.6);
  const radius = size * 0.74;

  // Backdrop: dot grid, abstract streets, the scan radius.
  ctx.fillStyle = "#151515";
  for (let x = 8; x < W; x += 16) for (let y = 8; y < H; y += 16) ctx.fillRect(x, y, 1, 1);
  ctx.lineCap = "round";
  const street = (l: number[]) => {
    ctx.beginPath();
    ctx.moveTo(cx + l[0] * size, cy + l[1] * size);
    ctx.lineTo(cx + l[2] * size, cy + l[3] * size);
    ctx.stroke();
  };
  ctx.strokeStyle = "#121212";
  ctx.lineWidth = 7;
  [[-0.95, -0.2, 0.95, -0.32], [0.24, -0.9, 0.3, 0.9], [-0.85, 0.75, 0.75, -0.85]].forEach(street);
  ctx.strokeStyle = "#191919";
  ctx.lineWidth = 1;
  [[-0.9, 0.38, 0.9, 0.3], [-0.42, -0.9, -0.36, 0.9], [-0.9, -0.62, 0.2, 0.9]].forEach(street);
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = "#262626";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  // The sweep: starts north, turns clockwise, trails a fading wedge.
  if (local < SWEEP_MS) {
    const beam = (local / SWEEP_MS) * TAU - Math.PI / 2;
    const wedge = 1.1;
    let fill: string | CanvasGradient = "rgba(255,122,26,0.08)";
    if (typeof ctx.createConicGradient === "function") {
      const g = ctx.createConicGradient(beam - wedge, cx, cy);
      g.addColorStop(0, "rgba(255,122,26,0)");
      g.addColorStop(wedge / TAU, "rgba(255,122,26,0.24)");
      g.addColorStop(Math.min(1, wedge / TAU + 0.002), "rgba(255,122,26,0)");
      fill = g;
    }
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, beam - wedge, beam);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,150,80,0.85)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(beam) * radius, cy + Math.sin(beam) * radius);
    ctx.stroke();
  }

  // The grid: a cell appears when the beam has passed its angle.
  const positions = GRIDS[engine].positions;
  let named = 0;
  ctx.globalAlpha = local > ENGINE_MS - FADE_MS ? Math.max(0, (ENGINE_MS - local) / FADE_MS) : 1;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let k = 0; k < POINTS; k++) {
    const dx = (k % AI_N) - CENTRE;
    const dy = Math.floor(k / AI_N) - CENTRE;
    const x = cx + dx * step;
    const y = cy + dy * step;
    const angle = dx || dy ? (Math.atan2(dy, dx) + Math.PI / 2 + TAU) % TAU : 0;
    const age = local - (angle / TAU) * SWEEP_MS;
    if (age < 0) {
      ctx.fillStyle = "#2e2e2e";
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, TAU);
      ctx.fill();
      continue;
    }
    const position = positions[k];
    if (position !== null) named++;
    const grow = Math.min(1, age / 260);
    const side = cell * (0.55 + 0.45 * (1 - Math.pow(1 - grow, 3)));
    const style = cellStyle(position);
    roundedRect(ctx, x - side / 2, y - side / 2, side, side, 6);
    ctx.fillStyle = style.bg;
    ctx.fill();
    ctx.strokeStyle = style.border;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = style.fg;
    ctx.font = `500 ${Math.round(cell * 0.42)}px ${mono}`;
    ctx.fillText(style.label, x, y + 0.5);
    if (position !== null && age < 900) {
      const p = age / 900;
      ctx.strokeStyle = `rgba(255,122,26,${0.8 * (1 - p)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, side / 2 + 4 + p * 18, 0, TAU);
      ctx.stroke();
    }
    if (dx === 0 && dy === 0) {
      // The business pin.
      ctx.strokeStyle = "rgba(244,242,238,0.75)";
      ctx.lineWidth = 1.2;
      roundedRect(ctx, x - side / 2 - 4, y - side / 2 - 4, side + 8, side + 8, 8);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  return { engine, named };
}

export function RadarVisual() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const shown = useRef("");

  const canvasRef = useFeatureCanvas((surface, elapsedMs) => {
    const { engine, named } = paintRadar(surface, elapsedMs);
    const key = `${engine}|${named}`;
    const host = hostRef.current;
    if (!host || key === shown.current) return;
    shown.current = key;
    host.querySelectorAll<HTMLElement>("[data-chip]").forEach((chip, i) => {
      const on = i === engine;
      chip.dataset.on = String(on);
      const value = chip.querySelector<HTMLElement>("[data-pct]");
      if (value) value.textContent = pct(on ? named : GRIDS[i].named);
    });
    const count = host.querySelector<HTMLElement>("[data-named]");
    if (count) count.textContent = `${named}/${POINTS}`;
  });

  return (
    <Bezel>
      <BezelHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-[10px]">
            Live AI grid <LpSampleTag />
          </span>
        }
        status={
          <span className="flex items-center gap-[7px] font-sans text-[12.5px] text-lp-accent-text">
            <span aria-hidden className="size-[6px] rounded-full bg-lp-accent shadow-[0_0_8px_#ff7a1a]" />
            Scanning
          </span>
        }
      />
      <div ref={hostRef} aria-hidden className="relative h-[340px]">
        <canvas ref={canvasRef} className="absolute inset-0 block size-full" />
        <div className="absolute inset-x-[14px] top-[14px] flex gap-[5px]">
          {GRIDS.map((g, i) => (
            <div
              key={g.key}
              data-chip
              data-on={i === 0}
              className="group flex min-w-0 flex-1 items-center justify-between gap-1 rounded-lg border border-[#1f1f1f] bg-[#0b0b0b] px-[9px] py-[6px] text-[11.5px] leading-[1.3] text-lp-dim transition-colors duration-300 data-[on=true]:border-[rgba(255,122,26,0.5)] data-[on=true]:bg-[rgba(255,122,26,0.08)] data-[on=true]:text-lp-fg"
            >
              <span className="truncate">{g.label}</span>
              <span data-pct className="font-mono text-[#5a5a5a] transition-colors duration-300 group-data-[on=true]:text-[#ff9a52]">
                {pct(g.named)}
              </span>
            </div>
          ))}
        </div>
        <div className="absolute inset-x-4 bottom-[14px] flex justify-between gap-2 font-mono text-[11px] leading-[1.3] text-lp-faint">
          <span className="truncate">
            {QUERY} · {CITY}
          </span>
          <span className="shrink-0">
            <span data-named>{`${GRIDS[0].named}/${POINTS}`}</span> named
          </span>
        </div>
      </div>
      <p className="sr-only">
        Sample scan of {QUERY} in {CITY} on a {AI_N}×{AI_N} grid:{" "}
        {GRIDS.map((g) => `${g.label} names the business at ${g.named} of ${POINTS} points`).join(", ")}.
      </p>
      <AiDisclaimer className="m-0 border-t border-lp-line px-[18px] py-3 text-lp-dim" />
    </Bezel>
  );
}

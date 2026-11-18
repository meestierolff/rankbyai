"use client";

import { useRef } from "react";
import { PANEL_BG, roundedRect, useFeatureCanvas, type Surface } from "@/components/marketing/feature-row-shared";
import { Bezel, BezelHeader, LpSampleTag } from "@/components/marketing/lp";
import { estimateAiGrid, estimateMapsGrid } from "@/lib/cost/estimate";
import {
  DATAFORSEO_BUSINESS_INFO_PER_CALL, ENGINES, GEMINI, LLM_PARSE_BUDGET_USD, PRICES_READ_ON, type AiGridSize, type Engine, type MapsGridSize,
} from "@/lib/pricing-constants";

/*
 * Feature row B: a circuit that routes each scan to the vendor keys it uses and shows what each
 * vendor bills. Every amount is computed from lib/pricing-constants and lib/cost/estimate.
 *
 * The audit and the prospect report have no shared estimate function that can run in the browser
 * (theirs read the database), so their call mix is repeated here from the server code:
 *  - audit (src/lib/audit/run.ts, estimateAudit): Google profile details of the business and its
 *    top 3 competitors, plus two parsing calls on OpenAI budgeted at LLM_PARSE_BUDGET_USD each. It
 *    reuses the latest Maps and AI scan, which this sequence has already run.
 *  - prospect report (src/lib/prospects/batch.ts, estimateBatch): a 3×3 AI grid, a 5×5 Maps grid on
 *    the standard queue, and the same four profile lookups.
 */
const AI_GRID: AiGridSize = 3;
const MAPS_GRID: MapsGridSize = 7;
const PROSPECT_MAPS_GRID: MapsGridSize = 5;
const AUDIT_PROFILE_LOOKUPS = 4;
const AUDIT_PARSE_CALLS = 2;

const KEYS = ["OpenAI", "Perplexity", "Gemini", "DataForSEO"] as const;
const KEY_OF: Record<Engine, number> = { openai: 0, perplexity: 1, gemini: 2 };
const DATAFORSEO = 3;

interface Charge {
  key: number;
  usd: number;
  /** An upper bound (a budget), not a per-call price. */
  ceiling?: boolean;
}

const aiGrid = estimateAiGrid(AI_GRID, ENGINES);
const aiCharges: Charge[] = ENGINES.map((e) => ({ key: KEY_OF[e], usd: aiGrid.perEngineUsd[e] ?? 0 }));
const profileLookupsUsd = AUDIT_PROFILE_LOOKUPS * DATAFORSEO_BUSINESS_INFO_PER_CALL;

const JOBS: { label: string; charges: Charge[] }[] = [
  { label: `AI grid ${AI_GRID}×${AI_GRID}`, charges: aiCharges },
  { label: `Maps grid ${MAPS_GRID}×${MAPS_GRID}`, charges: [{ key: DATAFORSEO, usd: estimateMapsGrid(MAPS_GRID, "standard").totalUsd }] },
  {
    label: "Local AI Audit",
    charges: [
      { key: DATAFORSEO, usd: profileLookupsUsd },
      { key: KEY_OF.openai, usd: AUDIT_PARSE_CALLS * LLM_PARSE_BUDGET_USD, ceiling: true },
    ],
  },
  {
    label: "Prospect report",
    charges: [...aiCharges, { key: DATAFORSEO, usd: estimateMapsGrid(PROSPECT_MAPS_GRID, "standard").totalUsd + profileLookupsUsd }],
  },
];

/** One of each scan: the total shown on the still frame. */
const ROUND_USD = JOBS.reduce((sum, job) => sum + job.charges.reduce((s, c) => s + c.usd, 0), 0);
const usd3 = (v: number) => `$${v.toFixed(3)}`;
const tagText = (c: Charge) => (c.ceiling ? `up to ${usd3(c.usd)}` : `+${usd3(c.usd)}`);

/** Timeline of one event, in ms. */
const EVENT_MS = 2600;
const IN_MS = 700; // the pulse travels from the scan to the chip
const OUT_AT = 800; // the fan-out to the keys starts
const OUT_MS = 800;
const FADE_AT = 1800;
const FADE_MS = 700;
const TAG_MS = 1500;
const TAU = Math.PI * 2;

interface Ledger {
  total: number;
  shown: number;
  tags: { key: number; text: string; born: number }[];
  event: number;
  charged: boolean;
  prev: number;
}

type Pt = [number, number];
const orange = (a: number) => `rgba(255,122,26,${a})`;

/** The part of a polyline up to fraction `p` of its length. */
function partial(pts: Pt[], p: number): Pt[] {
  const seg: number[] = [];
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(l);
    len += l;
  }
  let rem = p * len;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (rem >= seg[i - 1]) {
      out.push(pts[i]);
      rem -= seg[i - 1];
    } else {
      const f = seg[i - 1] ? rem / seg[i - 1] : 0;
      out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]);
      break;
    }
  }
  return out;
}

function paintRouter({ ctx, width: W, height: H, mono, sans }: Surface, elapsedMs: number | null, ledger: Ledger) {
  const moving = elapsedMs !== null;
  const el = elapsedMs ?? 0;
  const index = Math.floor(el / EVENT_MS);
  const lt = moving ? el % EVENT_MS : -1;
  const jobIndex = index % JOBS.length;
  const job = JOBS[jobIndex];
  if (moving && index !== ledger.event) {
    ledger.event = index;
    ledger.charged = false;
  }

  // Geometry: scans on the left, keys on the right, the chip in the middle.
  const bw = Math.min(112, Math.max(76, W * 0.27));
  const bh = 28;
  const top = 84;
  const bot = H - 36;
  const rows = [0, 1, 2, 3].map((k) => top + ((bot - top) * (k + 0.5)) / 4);
  const cx = W / 2;
  const cy = (top + bot) / 2;
  const chip = 52;
  const lx = 14;
  const rx = W - 14 - bw;
  const bend = [12, 24, 24, 12];
  const port = [-15, -5, 5, 15];
  const left = (k: number): Pt[] => [[lx + bw, rows[k]], [cx - chip / 2 - bend[k], rows[k]], [cx - chip / 2 - bend[k], cy + port[k]], [cx - chip / 2, cy + port[k]]];
  const right = (k: number): Pt[] => [[cx + chip / 2, cy + port[k]], [cx + chip / 2 + bend[k], cy + port[k]], [cx + chip / 2 + bend[k], rows[k]], [rx, rows[k]]];
  const stroke = (pts: Pt[], colour: string, width: number) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  };

  ctx.fillStyle = "#141414";
  for (let x = 8; x < W; x += 14) for (let y = 8; y < H; y += 14) ctx.fillRect(x, y, 1, 1);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let k = 0; k < 4; k++) {
    stroke(left(k), "#242424", 1);
    stroke(right(k), "#242424", 1);
  }

  // The lit traces of the current event.
  const litIn = lt >= 0 ? Math.min(1, lt / IN_MS) : 0;
  const litOut = lt >= OUT_AT ? Math.min(1, (lt - OUT_AT) / OUT_MS) : 0;
  const fade = lt < 0 ? 0 : lt < FADE_AT ? 1 : Math.max(0, 1 - (lt - FADE_AT) / FADE_MS);
  const keysOn = job.charges.map((c) => c.key);
  const head = (pts: Pt[]) => {
    const p = pts[pts.length - 1];
    ctx.fillStyle = "#ffd2b0";
    ctx.beginPath();
    ctx.arc(p[0], p[1], 2.6, 0, TAU);
    ctx.fill();
  };
  const pulse = (pts: Pt[], lit: number) => {
    ctx.shadowColor = "#ff7a1a";
    ctx.shadowBlur = 8;
    const shown = partial(pts, lit);
    stroke(shown, orange(fade), 1.6);
    ctx.shadowBlur = 0;
    if (lit < 1) head(shown);
  };
  if (litIn > 0 && fade > 0) pulse(left(jobIndex), litIn);
  if (litOut > 0 && fade > 0) keysOn.forEach((k) => pulse(right(k), litOut));

  // The charge lands when the fan-out reaches the keys.
  if (moving && lt >= OUT_AT + OUT_MS && !ledger.charged) {
    ledger.charged = true;
    for (const c of job.charges) {
      ledger.total += c.usd;
      ledger.tags.push({ key: c.key, text: tagText(c), born: el });
    }
  }

  const via = (p: Pt) => {
    ctx.beginPath();
    ctx.arc(p[0], p[1], 2.5, 0, TAU);
    ctx.fillStyle = PANEL_BG;
    ctx.fill();
    ctx.strokeStyle = "#3a3a3a";
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  for (let k = 0; k < 4; k++) {
    const a = left(k);
    const b = right(k);
    via(a[1]);
    via(a[2]);
    via(b[1]);
    via(b[2]);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const labelPx = bw < 92 ? 10 : 11.5;
  const box = (x: number, y: number, label: string, glow: number) => {
    roundedRect(ctx, x, y - bh / 2, bw, bh, 6);
    ctx.fillStyle = "#0b0b0b";
    ctx.fill();
    if (glow > 0) {
      ctx.fillStyle = orange(0.1 * glow);
      ctx.fill();
    }
    ctx.strokeStyle = glow > 0 ? orange(0.3 + 0.6 * glow) : "#2a2a2a";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `500 ${labelPx}px ${sans}`;
    ctx.fillStyle = glow > 0.3 ? "#f4f2ee" : "#8f8f8f";
    ctx.fillText(label, x + bw / 2, y + 0.5);
  };
  for (let k = 0; k < 4; k++) box(lx, rows[k], JOBS[k].label, lt >= 0 && k === jobIndex ? fade : 0);
  for (let k = 0; k < 4; k++) box(rx, rows[k], KEYS[k], litOut >= 1 && keysOn.includes(k) ? fade : 0);

  // The chip: a rounded square with the 3×3 dot mark.
  const flash = lt >= IN_MS - 80 && lt < OUT_AT + OUT_MS ? 1 : lt >= OUT_AT + OUT_MS && lt < FADE_AT ? 0.5 : 0;
  roundedRect(ctx, cx - chip / 2, cy - chip / 2, chip, chip, 11);
  ctx.fillStyle = "#0e0e0e";
  ctx.fill();
  if (flash) {
    ctx.shadowColor = "#ff7a1a";
    ctx.shadowBlur = 18 * flash;
  }
  ctx.strokeStyle = flash ? orange(0.45 + 0.5 * flash) : "#3a3a3a";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  for (let i = 0; i < 9; i++) {
    const centre = i === 4;
    ctx.beginPath();
    ctx.arc(cx + ((i % 3) - 1) * 9, cy + (Math.floor(i / 3) - 1) * 9, centre ? 3.2 : 2.4, 0, TAU);
    ctx.fillStyle = centre ? "#ff7a1a" : flash ? "#f4f2ee" : "#8a8a8a";
    ctx.fill();
  }
  ctx.font = `500 10px ${mono}`;
  ctx.fillStyle = "#5a5a5a";
  ctx.fillText("RankbyAI", cx, cy + chip / 2 + 13);
  ctx.fillText("SCANS", lx + bw / 2, top - 24);
  ctx.fillText("YOUR KEYS", rx + bw / 2, top - 24);

  // Cost tags float up from the keys that were just billed.
  if (moving) {
    ledger.tags = ledger.tags.filter((t) => el - t.born < TAG_MS);
    ctx.font = `500 11px ${mono}`;
    ctx.fillStyle = "#ffb27a";
    for (const t of ledger.tags) {
      const age = (el - t.born) / TAG_MS;
      ctx.globalAlpha = Math.max(0, 1 - age);
      ctx.fillText(t.text, rx + bw / 2, rows[t.key] - bh / 2 - 9 - age * 4);
    }
    ctx.globalAlpha = 1;
  }

  // The running total eases toward what has been billed so far.
  if (moving) {
    const frames = Math.max(0, el - ledger.prev) / (1000 / 60);
    ledger.shown += (ledger.total - ledger.shown) * (1 - Math.pow(0.92, frames));
    ledger.prev = el;
  }
  const total = moving ? ledger.shown : ROUND_USD;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `400 11px ${sans}`;
  ctx.fillStyle = "#6b6b6b";
  ctx.fillText("Billed to your keys this month", 14, 22);
  ctx.font = `500 17px ${mono}`;
  ctx.fillStyle = "#f4f2ee";
  ctx.fillText(`$${total.toFixed(4)}`, 14, 44);
  ctx.textAlign = "right";
  ctx.font = `400 11px ${sans}`;
  ctx.fillStyle = "#6b6b6b";
  ctx.fillText("Markup from us", W - 14, 22);
  ctx.font = `500 17px ${mono}`;
  ctx.fillStyle = "#ff8a3d";
  ctx.fillText("$0.00", W - 14, 44);
  ctx.textAlign = "center";
  ctx.font = `400 10.5px ${mono}`;
  ctx.fillStyle = "#4d4d4d";
  ctx.fillText("every call billed by the vendor, at cost", cx, H - 12);
}

export function RouterVisual() {
  const ledger = useRef<Ledger>({ total: 0, shown: 0, tags: [], event: -1, charged: false, prev: 0 });
  const canvasRef = useFeatureCanvas((surface, elapsedMs) => paintRouter(surface, elapsedMs, ledger.current));

  return (
    <Bezel>
      <BezelHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-[10px]">
            Key router <LpSampleTag />
          </span>
        }
        status={
          <span className="flex items-center gap-[7px] font-sans text-[12.5px] text-lp-accent-text">
            <span aria-hidden className="size-[6px] rounded-full bg-lp-accent shadow-[0_0_8px_#ff7a1a]" />
            At cost
          </span>
        }
      />
      <div className="relative h-[340px]">
        <canvas ref={canvasRef} aria-hidden className="absolute inset-0 block size-full" />
      </div>
      <p className="sr-only">
        Sample of what each scan bills to your own keys:{" "}
        {JOBS.map((job) => `${job.label}: ${job.charges.map((c) => `${KEYS[c.key]} ${c.ceiling ? "up to " : ""}${usd3(c.usd)}`).join(", ")}`).join(". ")}. One of each
        comes to ${ROUND_USD.toFixed(2)}. Markup from us: $0.00.
      </p>
      <p className="m-0 border-t border-lp-line px-[18px] py-3 text-[12px] leading-normal text-lp-dim">
        Estimates from the vendors&apos; prices, read on {PRICES_READ_ON}. The Gemini amount assumes its free allowance of{" "}
        {GEMINI.freeGroundedRequestsPerMonth.toLocaleString("en-US")} grounded requests a month.
      </p>
    </Bezel>
  );
}

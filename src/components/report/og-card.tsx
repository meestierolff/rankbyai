import { ImageResponse } from "next/og";
import { DATA_HEX } from "@/components/brand/grid";
import { AI_DISCLAIMER_SHORT } from "@/lib/copy";
import { brandTextOnDark, fitVerdict, fmtDay, headlineStats, placeOf, verdict } from "./derive";
import { aiPointLook, mapsPointLook } from "./model";
import type { ReportView } from "./types";

export const OG_SIZE = { width: 1200, height: 630 };

/** Grid colours are CSS variables on the page; the image needs fixed values. */
const HEX: Record<string, string> = {
  "var(--rb-g1)": DATA_HEX.g1, "var(--rb-g2)": DATA_HEX.g2, "var(--rb-g3)": DATA_HEX.g3, "var(--rb-amber)": DATA_HEX.amber, "var(--rb-orange)": DATA_HEX.orange,
  "var(--rb-red)": DATA_HEX.red, "var(--rb-none)": "#2a2a2a", "var(--rb-well)": "#1a1a1a", "var(--rb-bg)": "#0b0b0b", "var(--rb-fg)": "#f4f2ee", "var(--rb-fg-2)": "#d6d3ce", "var(--rb-faint)": "#6b6b6b",
};
const hex = (c: string) => HEX[c] ?? (/^#[0-9a-f]{3,8}$/i.test(c) ? c : "transparent");
export const cut = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…`);

function MiniGrid({ view }: { view: ReportView }) {
  const ai = view.ai && view.ai.n > 1 ? view.ai : null;
  const maps = view.maps && !view.maps.single && view.maps.n > 1 ? view.maps : null;
  const layer = ai ?? maps;
  if (!layer) return null;
  const n = layer.n;
  // Fits the middle band of a 630px image with its caption (measured 18 Nov 2026: 318 overflowed).
  const size = 268;
  const gap = n >= 13 ? 3 : n >= 9 ? 4 : n >= 5 ? 8 : 14;
  const pad = 16;
  // One pixel of slack per row: the renderer wraps a row that is even a pixel too wide.
  const cell = Math.floor((size - pad * 2 - 2 - gap * (n - 1) - 1) / n);
  const looks = ai ? ai.points.map(aiPointLook) : maps!.points.map(mapsPointLook);
  const showLabels = cell >= 28;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
      {/* Explicit rows (not flex-wrap): the image renderer would otherwise wrap a row early by a pixel. */}
      <div style={{ display: "flex", flexDirection: "column", gap, width: size, height: size, padding: pad, background: "#0e0e0e", border: "1px solid #1c1c1c", borderRadius: 22 }}>
        {Array.from({ length: n }, (_, r) => (
          <div key={r} style={{ display: "flex", flexWrap: "nowrap", gap }}>
            {looks.slice(r * n, r * n + n).map((l, c) => (
              <div
                key={c}
                style={{
                  display: "flex", flexShrink: 0, alignItems: "center", justifyContent: "center", width: cell, height: cell, borderRadius: cell,
                  background: l.dashed ? "transparent" : hex(l.bg), border: l.dashed ? "2px dashed #5a5a5a" : "none",
                  color: hex(l.fg), fontSize: Math.min(20, Math.max(12, cell * 0.34)),
                }}
              >
                {showLabels ? l.label : ""}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", fontSize: 18, color: "#8f8f8f" }}>{ai ? `AI assistants, ${n}×${n} grid` : `Google Maps, ${n}×${n} grid`}</div>
    </div>
  );
}

/**
 * Brand mark of an image: the agency's logo (an inline data URI, when given) and name when
 * white-labelled, nothing when RankbyAI is hidden, else the dot mark.
 */
export function BrandMark({ view, logo = null }: { view: ReportView; logo?: string | null }) {
  const { brand } = view;
  if (logo) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by next/og, not a page */}
        <img src={logo} alt="" height={44} style={{ height: 44, maxWidth: 180, objectFit: "contain" }} />
        {brand.name ? <div style={{ display: "flex", fontSize: 28, color: brandTextOnDark(brand.color) ?? "#f4f2ee", letterSpacing: -0.5 }}>{cut(brand.name, 32)}</div> : null}
      </div>
    );
  }
  if (brand.name) return <div style={{ display: "flex", fontSize: 28, color: brandTextOnDark(brand.color) ?? "#f4f2ee", letterSpacing: -0.5 }}>{cut(brand.name, 40)}</div>;
  if (brand.hideRankbyai) return <div style={{ display: "flex" }} />;
  const at = [0, 1, 2];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {at.map((r) => (
          <div key={r} style={{ display: "flex", gap: 6 }}>
            {at.map((c) => <div key={c} style={{ width: 10, height: 10, borderRadius: 5, background: r === 1 && c === 1 ? "#ff7a1a" : "#f4f2ee" }} />)}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", fontSize: 30, letterSpacing: -0.5 }}>RankbyAI</div>
    </div>
  );
}

/** The link preview of a report: who it is about, the finding, and the headline numbers. Data only. */
export function reportOgImage(view: ReportView): ImageResponse {
  const stats = headlineStats(view);
  const name = view.business.name;
  const nameSize = name.length <= 26 ? 66 : name.length <= 44 ? 54 : 44;
  const meta = [view.business.category, placeOf(view)].filter(Boolean).join(" · ");
  const hasGrid = !!((view.ai && view.ai.n > 1) || (view.maps && !view.maps.single && view.maps.n > 1));
  const finding = fitVerdict(verdict(view), !hasGrid);
  // AI results are shown, so the "AI answers vary" note is shown with them.
  const aiShown = stats.some((s) => s.key === "ai");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#000000", color: "#f4f2ee", padding: aiShown ? "42px 60px 30px" : "48px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <BrandMark view={view} />
          <div style={{ display: "flex", fontSize: 20, color: "#8f8f8f", letterSpacing: 1.5, textTransform: "uppercase" }}>
            {`${view.kind === "free_check" ? "Free AI visibility check" : "AI visibility report"} · ${fmtDay(view.updatedAt, "short")}`}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, width: hasGrid ? 720 : 1080 }}>
            <div style={{ display: "flex", fontSize: nameSize, lineHeight: 1.04, letterSpacing: -2 }}>{cut(name, 70)}</div>
            {meta ? <div style={{ display: "flex", fontSize: 24, color: "#8f8f8f" }}>{cut(meta, 60)}</div> : null}
            <div style={{ display: "flex", fontSize: finding.size, lineHeight: 1.35, color: "#d6d3ce", marginTop: 6 }}>{finding.text}</div>
          </div>
          {hasGrid ? <MiniGrid view={view} /> : null}
        </div>

        <div style={{ display: "flex", gap: 18 }}>
          {stats.map((s) => (
            <div key={s.key} style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, padding: "16px 22px", border: "1px solid #262626", borderRadius: 18, background: "#0a0a0a" }}>
              <div style={{ display: "flex", fontSize: 17, color: "#8f8f8f", letterSpacing: 1.5, textTransform: "uppercase" }}>{s.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <div style={{ display: "flex", fontSize: 50, lineHeight: 1, letterSpacing: -1.5 }}>{s.value}</div>
                {s.of ? <div style={{ display: "flex", fontSize: 26, color: "#7a7a7a" }}>{`/${s.of}`}</div> : null}
                <div style={{ display: "flex", fontSize: 19, color: "#8f8f8f", marginLeft: 6 }}>{s.unit}</div>
              </div>
            </div>
          ))}
        </div>
        {aiShown ? <div style={{ display: "flex", fontSize: 16, color: "#6b6b6b", marginTop: -8 }}>{AI_DISCLAIMER_SHORT}</div> : null}
      </div>
    ),
    { ...OG_SIZE, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } },
  );
}

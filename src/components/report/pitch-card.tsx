import { ImageResponse } from "next/og";
import { AI_DISCLAIMER_SHORT } from "@/lib/copy";
import { brandTextOnDark, fmtDay, placeOf } from "./derive";
import { BrandMark, OG_SIZE, cut, reportOgImage } from "./og-card";
import type { PitchComparison } from "./pitch";
import type { ReportView } from "./types";

/** RankbyAI's own accent, used for the business's bar when no readable brand colour is set. */
const ACCENT = "#ff7a1a";

const HEADING: Record<PitchComparison["metric"], string> = {
  ai_points: "Spots where AI assistants named the business",
  maps_top3_points: "Spots in the Google Maps top 3",
};

/** Column widths of a bar row; together with the gaps they fit the 1080 px content width. */
const LABEL_W = 300;
const TRACK_W = 600;
const VALUE_W = 110;

function Bar({ label, value, of, you, color }: { label: string; value: number; of: number; you: boolean; color: string }) {
  const share = of > 0 ? Math.max(0, Math.min(1, value / of)) : 0;
  // A zero still shows a sliver, so the row reads as a bar.
  const width = Math.max(10, Math.round(share * TRACK_W));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <div style={{ display: "flex", width: LABEL_W, flexShrink: 0, overflow: "hidden", whiteSpace: "nowrap", fontSize: 26, color: you ? "#f4f2ee" : "#bdbab4", fontWeight: you ? 700 : 400 }}>{cut(label, 22)}</div>
      <div style={{ display: "flex", width: TRACK_W, flexShrink: 0, height: 34, background: "#141414", borderRadius: 17 }}>
        <div style={{ display: "flex", width, height: 34, background: you ? color : "#4a4a4a", borderRadius: 17 }} />
      </div>
      <div style={{ display: "flex", width: VALUE_W, flexShrink: 0, alignItems: "baseline", gap: 4, fontSize: 34, letterSpacing: -1, color: you ? "#f4f2ee" : "#bdbab4" }}>
        {String(value)}
        <span style={{ fontSize: 22, color: "#7a7a7a" }}>{`/${of}`}</span>
      </div>
    </div>
  );
}

/**
 * The image that goes with the email teaser: the business against the rivals ahead of it at the
 * same grid points, from `pitchAsset(view).comparison`. With no rival ahead it is the report's
 * normal link preview. `logo` is the agency logo as a data URI (lib/logo), when white-labelled.
 */
export function pitchImage(view: ReportView, comparison: PitchComparison | null, logo: string | null): ImageResponse {
  if (!comparison?.rivals.length) return reportOgImage(view);
  const date = comparison.metric === "ai_points" ? view.ai?.date : view.maps?.date;
  const place = placeOf(view);
  const you = brandTextOnDark(view.brand.color) ?? ACCENT;
  const rows = [{ ...comparison.you, you: true }, ...comparison.rivals.map((r) => ({ ...r, you: false }))].sort((a, b) => b.value - a.value);
  const name = view.business.name;
  const nameSize = name.length <= 30 ? 58 : name.length <= 50 ? 46 : 38;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#000000", color: "#f4f2ee", padding: "42px 60px 30px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <BrandMark view={view} logo={logo} />
          <div style={{ display: "flex", fontSize: 20, color: "#8f8f8f", letterSpacing: 1.5, textTransform: "uppercase" }}>{date ? fmtDay(date, "short") : ""}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", fontSize: nameSize, lineHeight: 1.05, letterSpacing: -1.5 }}>{cut(name, 70)}</div>
          <div style={{ display: "flex", fontSize: 24, color: "#8f8f8f" }}>{cut(`${HEADING[comparison.metric]}${place ? `, around ${place}` : ""}`, 90)}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {rows.map((r) => <Bar key={`${r.you}-${r.name}`} label={r.name} value={r.value} of={comparison.of} you={r.you} color={you} />)}
        </div>

        <div style={{ display: "flex", fontSize: 16, color: "#6b6b6b" }}>
          {comparison.metric === "ai_points" ? `Out of ${comparison.of} spots checked on the same grid. ${AI_DISCLAIMER_SHORT}` : `Out of ${comparison.of} spots checked on the same grid.`}
        </div>
      </div>
    ),
    { ...OG_SIZE, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } },
  );
}

import { ImageResponse } from "next/og";
import { OG_SIZE } from "@/lib/og";

export const alt = "Local SEO audit: Maps + reviews + AI answers. Sample data: 62/100 with three priority findings.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: 56, background: "#0b0b0b", color: "#f2f0ec" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "#a1a1a1" }}><span>rankbyai.live</span><span>Sample data · fictional business</span></div>
      <div style={{ display: "flex", flexDirection: "column", fontSize: 60, fontWeight: 600, letterSpacing: -2, lineHeight: 1.06 }}><span>Local SEO audit:</span><span>Maps + reviews + AI answers</span></div>
      <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "baseline", padding: 28, border: "3px solid #e6b23a", borderRadius: 24, fontSize: 76 }}><span>62</span><span style={{ fontSize: 24, color: "#a1a1a1" }}>/100</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
          {[["P0", "Conflicting phone numbers", "#d9473c"], ["P1", "Review gap vs map-pack median", "#e57f35"], ["P2", "Missing FAQ schema", "#e6b23a"]].map(([priority, label, color]) => (
            <div key={priority} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", background: "#141414", border: "1px solid #2a2a2a", borderRadius: 12, fontSize: 25 }}><span style={{ color }}>{priority}</span><span>{label}</span></div>
          ))}
        </div>
      </div>
    </div>, size,
  );
}

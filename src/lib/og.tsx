import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

async function logoSrc(): Promise<string> {
  const logo = await readFile(join(process.cwd(), "public/brand/logo.png"));
  return `data:image/png;base64,${logo.toString("base64")}`;
}

/** Shared 1200×630 social card in the brand look. Text only, no invented numbers. */
export async function ogCard({ eyebrow, title, footer }: { eyebrow: string; title: string; footer?: string }) {
  const src = await logoSrc();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0b0b0b", color: "#f5f5f5", padding: 72 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" width={118} height={64} />
          <div style={{ display: "flex", fontSize: 34, fontWeight: 600, letterSpacing: -1 }}>
            rankbyai<span style={{ color: "#8a8a8a" }}>.live</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 3, textTransform: "uppercase", color: "#a1a1a1" }}>{eyebrow}</div>
          <div style={{ display: "flex", fontSize: title.length > 60 ? 62 : 80, fontWeight: 600, lineHeight: 1.04, letterSpacing: -3.2, maxWidth: 1040 }}>{title}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26, color: "#a1a1a1" }}>
          <div style={{ display: "flex" }}>{footer ?? "Pay once · Your own API keys · 14-day refund"}</div>
          <div style={{ display: "flex", gap: 10 }}>
            {["#3fbf6a", "#e6b23a", "#e57f35", "#d9473c"].map((c) => (
              <div key={c} style={{ width: 26, height: 26, borderRadius: 13, background: c }} />
            ))}
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}

/**
 * Two-column comparison card (1200×630): one short line per vendor, text only. No vendor logos
 * (trademarks), and every figure comes from the page's dated table.
 */
export async function ogVersusCard({ eyebrow, columns, footer }: { eyebrow: string; columns: { name: string; line: string }[]; footer: string }) {
  const src = await logoSrc();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0b0b0b", color: "#f5f5f5", padding: 72 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" width={118} height={64} />
          <div style={{ display: "flex", fontSize: 34, fontWeight: 600, letterSpacing: -1 }}>
            rankbyai<span style={{ color: "#8a8a8a" }}>.live</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 3, textTransform: "uppercase", color: "#a1a1a1" }}>{eyebrow}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {columns.flatMap((c, i) => [
              ...(i > 0 ? [<div key={`vs${i}`} style={{ display: "flex", fontSize: 30, color: "#6f6f6f" }}>vs</div>] : []),
              <div key={c.name} style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1, flexBasis: 0, border: "2px solid #2a2a2a", borderRadius: 24, background: "#141414", padding: "34px 36px" }}>
                <div style={{ display: "flex", fontSize: 58, fontWeight: 600, letterSpacing: -2.4, lineHeight: 1 }}>{c.name}</div>
                <div style={{ display: "flex", fontSize: 36, color: "#d4d4d4", lineHeight: 1.15 }}>{c.line}</div>
              </div>,
            ])}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#a1a1a1" }}>{footer}</div>
      </div>
    ),
    OG_SIZE,
  );
}

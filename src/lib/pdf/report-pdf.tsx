import "server-only";
import { Document, Font, Link, Page, Rect, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { DATA_HEX, type CellView } from "@/components/brand/grid";
import { AI_DISCLAIMER_TEXT } from "@/lib/copy";
import type { ReportView } from "@/lib/reports";

/**
 * PDF of a report (brief 7.6): the same content as the live page at /r/{slug}, laid out for paper.
 * Heatmaps are drawn as vector shapes; the QR code points at the live link.
 * Built from the public ReportView only, so it cannot contain anything the public page does not show.
 */
// Names must never be split across lines with a hyphen ("Den-tistry").
Font.registerHyphenationCallback((word) => [word]);

const INK = "#111111";
const MUTED = "#5c5c5c";
const LINE = "#dddddd";

/** The screen palette uses CSS variables; paper needs fixed colours. */
const PAPER: Record<string, string> = {
  "var(--rb-g1)": DATA_HEX.g1, "var(--rb-g2)": DATA_HEX.g2, "var(--rb-g3)": DATA_HEX.g3, "var(--rb-amber)": DATA_HEX.amber, "var(--rb-orange)": DATA_HEX.orange, "var(--rb-red)": DATA_HEX.red,
  "var(--rb-none)": "#e4e4e4", "var(--rb-well)": "#f0f0f0", "var(--rb-bg)": "#0b0b0b", "var(--rb-fg)": "#ffffff", "var(--rb-faint)": "#7a7a7a",
};
const paper = (c: string) => PAPER[c] ?? (/^#[0-9a-f]{3,8}$/i.test(c) ? c : "#e4e4e4");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
const safeColor = (c: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : INK);

const s = StyleSheet.create({
  // The bottom padding keeps flowing content clear of the fixed footer on every page.
  page: { paddingTop: 36, paddingHorizontal: 36, paddingBottom: 124, fontFamily: "Helvetica", fontSize: 10, color: INK, lineHeight: 1.4 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: LINE, paddingBottom: 10, marginBottom: 18 },
  brand: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  meta: { fontSize: 8, color: MUTED },
  eyebrow: { fontSize: 8, color: MUTED, letterSpacing: 1, textTransform: "uppercase" },
  h1: { fontSize: 24, fontFamily: "Helvetica-Bold", marginTop: 4, lineHeight: 1.15 },
  sub: { fontSize: 11, color: MUTED, marginTop: 2 },
  opener: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 12, paddingLeft: 10, borderLeftWidth: 2, lineHeight: 1.35 },
  cols: { flexDirection: "row", gap: 18, marginTop: 18 },
  col: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 12 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", lineHeight: 1.25 },
  small: { fontSize: 8, color: MUTED, marginTop: 2 },
  body: { fontSize: 9, color: MUTED, marginTop: 6 },
  section: { marginTop: 16, borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 12 },
  finding: { flexDirection: "row", gap: 8, marginTop: 8 },
  badge: { width: 22, height: 14, borderRadius: 3, alignItems: "center", justifyContent: "center", marginTop: 1 },
  badgeText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#ffffff", lineHeight: 1 },
  footer: { position: "absolute", left: 36, right: 36, bottom: 28, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 16, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 10 },
});

const BADGE: Record<string, string> = { P0: DATA_HEX.red, P1: DATA_HEX.orange, P2: "#b88a1e", P3: "#6b6b6b" };

function Heatmap({ n, cells, size = 190 }: { n: number; cells: CellView[]; size?: number }) {
  const gap = 3;
  const cell = (size - gap * (n - 1)) / n;
  return (
    <View style={{ width: size, height: size, marginTop: 8, alignSelf: "center" }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {cells.slice(0, n * n).map((c, i) => (
          <Rect key={c.key} x={(i % n) * (cell + gap)} y={Math.floor(i / n) * (cell + gap)} width={cell} height={cell} rx={3} fill={paper(c.bg)} />
        ))}
      </Svg>
      {/* Labels as text on top of the shapes, so they stay selectable and sharp. */}
      {cells.slice(0, n * n).map((c, i) => (
        <Text key={`t${c.key}`} style={{ position: "absolute", left: (i % n) * (cell + gap), top: Math.floor(i / n) * (cell + gap) + cell / 2 - 5, width: cell, textAlign: "center", fontSize: n >= 5 ? 8 : 10, fontFamily: "Helvetica-Bold", color: paper(c.bg) === "#e4e4e4" || paper(c.bg) === DATA_HEX.amber || paper(c.bg) === DATA_HEX.g1 ? INK : "#ffffff" }}>
          {c.label}
        </Text>
      ))}
    </View>
  );
}

function Qr({ url, size = 64 }: { url: string; size?: number }) {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const unit = size / n;
  const dark: { x: number; y: number }[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.data[y * n + x]) dark.push({ x, y });
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect x={0} y={0} width={size} height={size} fill="#ffffff" />
      {dark.map((d) => <Rect key={`${d.x}-${d.y}`} x={d.x * unit} y={d.y * unit} width={unit + 0.05} height={unit + 0.05} fill="#000000" />)}
    </Svg>
  );
}

export function ReportDocument({ view, liveUrl }: { view: ReportView; liveUrl: string }) {
  const { business, brand, ai, maps, audit } = view;
  const accent = safeColor(brand.color);
  const where = [business.city, business.region].filter(Boolean).join(", ");
  return (
    <Document title={`${business.name}: AI visibility report`} author={brand.name ?? "RankbyAI"} creator="RankbyAI" producer="RankbyAI">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.brand}>{brand.name ?? "rankbyai.live"}</Text>
          <Text style={s.meta}>{brand.hideRankbyai ? `Data: Google Maps + AI assistants, ${day(view.updatedAt)}` : `Verified by RankbyAI · ${day(view.updatedAt)}`}</Text>
        </View>

        <Text style={s.eyebrow}>AI visibility report</Text>
        <Text style={s.h1}>{business.name}</Text>
        {business.category || where ? <Text style={s.sub}>{[business.category, where].filter(Boolean).join(" · ")}</Text> : null}
        {view.opener ? <Text style={[s.opener, { borderLeftColor: accent }]}>{view.opener}</Text> : null}

        <View style={s.cols}>
          {ai && !ai.single ? (
            <View style={s.col}>
              <Text style={s.h2}>AI assistants: named at {ai.pointsMentioned} of {ai.n * ai.n} points</Text>
              <Text style={s.small}>“best {ai.service} near me” · {ai.n}×{ai.n} grid · {day(ai.date)}</Text>
              <Heatmap n={ai.n} cells={ai.cells} />
              <Text style={s.body}>{ai.engines.map((e) => `${e.label}: ${e.available ? `${e.mentioned}/${e.done}` : "unavailable"}`).join("   ")}</Text>
              {ai.namedInstead.length ? <Text style={s.body}>Named most often instead: {ai.namedInstead.slice(0, 4).map((c) => c.name).join(", ")}.</Text> : null}
              <Text style={s.small}>Each cell: how many of the engines named the business at that point.</Text>
            </View>
          ) : null}
          {maps && !maps.single ? (
            <View style={s.col}>
              <Text style={s.h2}>Google Maps: top 3 at {maps.top3Points} of {maps.pointsDone} points</Text>
              <Text style={s.small}>Keyword “{maps.keyword}” · {maps.n}×{maps.n} grid · {day(maps.date)}</Text>
              <Heatmap n={maps.n} cells={maps.cells} />
              {maps.avgRank != null ? <Text style={s.body}>Average rank {maps.avgRank.toFixed(1)} (a point outside the top 20 counts as 21).</Text> : null}
              <Text style={s.small}>Each cell: the business&apos;s Google Maps rank at that point.</Text>
            </View>
          ) : null}
        </View>

        {audit ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Local AI Audit: {audit.score} out of 100</Text>
            <Text style={s.small}>Checked on {day(audit.date)}. Highest-priority findings:</Text>
            {audit.findings.length === 0 ? <Text style={s.body}>No high-priority findings.</Text> : audit.findings.map((f, i) => (
              <View key={i} style={s.finding}>
                <View style={[s.badge, { backgroundColor: BADGE[f.priority] ?? "#6b6b6b" }]}><Text style={s.badgeText}>{f.priority}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>{f.title}</Text>
                  {f.fix ? <Text style={{ fontSize: 9, color: MUTED }}>{f.fix}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <View style={{ flex: 1 }}>
            {brand.name && brand.website ? <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 4 }}>Get this fixed by {brand.name}: <Link src={brand.website} style={{ color: accent }}>{brand.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</Link></Text> : null}
            {ai ? <Text style={{ fontSize: 7.5, color: MUTED }}>{AI_DISCLAIMER_TEXT}</Text> : null}
            <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 3 }}>Live report: <Link src={liveUrl} style={{ color: INK }}>{liveUrl.replace(/^https?:\/\//, "")}</Link></Text>
          </View>
          <Qr url={liveUrl} />
        </View>
      </Page>
    </Document>
  );
}

export const renderReportPdf = (view: ReportView, liveUrl: string): Promise<Buffer> => renderToBuffer(<ReportDocument view={view} liveUrl={liveUrl} />);

export const pdfFileName = (businessName: string) => `${businessName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "report"}-ai-visibility.pdf`;

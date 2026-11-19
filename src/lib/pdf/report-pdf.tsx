import "server-only";
import { Circle, Document, Font, Image, Link, Page, Rect, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { DATA_HEX } from "@/components/brand/grid";
import { aroundPlace, atPlace, dataDates, fixPrompt, fmtDay, headlineStats, isHex6, orList, placeOf, quoteBlocks, verdict, type HeadlineStat, type QuoteBlock } from "@/components/report/derive";
import { aiPointLook, mapsPointLook } from "@/components/report/model";
import type { QuotedAnswer, ReportView } from "@/components/report/types";
import { AI_DISCLAIMER_TEXT, NOT_AFFILIATED } from "@/lib/copy";
import { publicEnv } from "@/lib/env-public";
import { ENGINE_LABEL } from "@/lib/pricing-constants";

/**
 * PDF of a report (brief 7.6): the same content, in the same order, as the live page at /r/{slug},
 * on white paper. Grids are drawn as vector dots; the QR code points at the live link.
 * Built from the public ReportView only, so it cannot contain anything the public page does not show.
 * Brand rules are the page's: the agency's name (and logo) when white-labelled, no RankbyAI when hidden.
 */
// Names must never be split across lines with a hyphen ("Den-tistry").
Font.registerHyphenationCallback((word) => [word]);

const INK = "#111111";
const BODY = "#3a3a3a";
const MUTED = "#5f5f5f";
const LINE = "#dedede";
const SOFT = "#f5f4f1";
const ORANGE = "#d4600c"; // the brand orange, darkened for text on white
const YOU_BG = "#e3f5e9";
const YOU_INK = "#1d6b38";

/** The screen palette uses CSS variables; paper needs fixed colours. */
const PAPER: Record<string, string> = {
  "var(--rb-g1)": DATA_HEX.g1, "var(--rb-g2)": DATA_HEX.g2, "var(--rb-g3)": DATA_HEX.g3, "var(--rb-amber)": DATA_HEX.amber, "var(--rb-orange)": DATA_HEX.orange, "var(--rb-red)": DATA_HEX.red,
  "var(--rb-none)": "#dcdcdc", "var(--rb-well)": "#f0f0f0", "var(--rb-bg)": INK, "var(--rb-fg)": "#ffffff", "var(--rb-fg-2)": "#555555", "var(--rb-faint)": "#7a7a7a",
};
const paper = (c: string) => PAPER[c] ?? (/^#[0-9a-f]{3,8}$/i.test(c) ? c : "#dcdcdc");
/** Label colour on a data dot: dark on light fills, white on dark fills. */
const labelOn = (fill: string) => ([DATA_HEX.g2, DATA_HEX.g3, DATA_HEX.red].includes(fill as never) ? "#ffffff" : INK);

/**
 * The built-in PDF fonts can only draw Latin-1 / Windows-1252 characters. Anything else (emoji,
 * arrows, other scripts) would print as garbage, so it is left out and the PDF says so.
 */
const CP1252_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const drawable = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  return c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || CP1252_EXTRA.has(ch);
};
function pdfText(s: string): { text: string; dropped: boolean } {
  let dropped = false;
  let out = "";
  for (const ch of s) {
    if (drawable(ch)) out += ch;
    else if (ch === "\t") out += " ";
    else dropped = true;
  }
  return { text: out, dropped };
}
const safe = (s: string) => pdfText(s).text;

const s = StyleSheet.create({
  // The bottom padding keeps flowing content clear of the fixed footer on every page.
  page: { paddingTop: 34, paddingHorizontal: 36, paddingBottom: 118, fontFamily: "Helvetica", fontSize: 9.5, color: INK, lineHeight: 1.4 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: LINE, paddingBottom: 10, marginBottom: 20 },
  brand: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  meta: { fontSize: 8, color: MUTED },
  eyebrow: { fontSize: 7.5, fontFamily: "Helvetica-Bold", letterSpacing: 1.2, textTransform: "uppercase" },
  h1: { fontSize: 25, fontFamily: "Helvetica-Bold", marginTop: 5, lineHeight: 1.12 },
  sub: { fontSize: 10.5, color: MUTED, marginTop: 3 },
  verdict: { fontSize: 12.5, color: BODY, marginTop: 12, paddingLeft: 10, borderLeftWidth: 2.5, lineHeight: 1.4 },
  section: { marginTop: 22 },
  h2: { fontSize: 14.5, fontFamily: "Helvetica-Bold", lineHeight: 1.2, marginTop: 3 },
  lead: { fontSize: 9, color: MUTED, marginTop: 3, marginBottom: 8 },
  box: { borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 10 },
  small: { fontSize: 7.5, color: MUTED },
  label: { fontSize: 7, fontFamily: "Helvetica-Bold", color: MUTED, letterSpacing: 0.8, textTransform: "uppercase" },
  badge: { width: 21, height: 13, borderRadius: 3, alignItems: "center", justifyContent: "center", marginTop: 1 },
  badgeText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#ffffff", lineHeight: 1 },
  footer: { position: "absolute", left: 36, right: 36, bottom: 26, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 16, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 9 },
});

const BADGE: Record<string, string> = { P0: DATA_HEX.red, P1: "#b8561b", P2: "#8a6a12", P3: "#6b6b6b" };

// ───────────────────────── parts ─────────────────────────

/** The 3×3 dot mark, drawn (the PDF cannot use the web SVG's CSS variables). */
function DotMarkPdf({ size = 14 }: { size?: number }) {
  const at = [3, 11, 19];
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22">
      {at.flatMap((cy, r) => at.map((cx, c) => <Circle key={`${r}${c}`} cx={cx} cy={cy} r={r === 1 && c === 1 ? 3.1 : 2.3} fill={r === 1 && c === 1 ? "#ff7a1a" : INK} />))}
    </Svg>
  );
}

type Look = { bg: string; fg: string; label: string; dashed: boolean };

function DotGridPdf({ n, looks, size }: { n: number; looks: Look[]; size: number }) {
  const gap = n >= 13 ? 1.6 : n >= 9 ? 2.4 : n >= 5 ? 4 : 7;
  const cell = (size - gap * (n - 1)) / n;
  const r = cell / 2;
  const labels = cell >= 13;
  const font = Math.max(5.5, Math.min(9, cell * 0.36));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {looks.slice(0, n * n).map((l, i) => {
          const cx = (i % n) * (cell + gap) + r;
          const cy = Math.floor(i / n) * (cell + gap) + r;
          return l.dashed
            ? <Circle key={i} cx={cx} cy={cy} r={r - 0.6} fill="#ffffff" stroke="#9a9a9a" strokeWidth={0.9} strokeDasharray="1.6,1.4" />
            : <Circle key={i} cx={cx} cy={cy} r={r} fill={paper(l.bg)} />;
        })}
      </Svg>
      {labels
        ? looks.slice(0, n * n).map((l, i) =>
            l.label ? (
              <Text key={`t${i}`} style={{ position: "absolute", left: (i % n) * (cell + gap), top: Math.floor(i / n) * (cell + gap) + cell / 2 - font * 0.62, width: cell, textAlign: "center", fontSize: font, fontFamily: "Helvetica-Bold", color: l.label === "!" ? "#555555" : labelOn(paper(l.bg)) }}>
                {l.label}
              </Text>
            ) : null,
          )
        : null}
    </View>
  );
}

function Legend({ items }: { items: { fill: string; text: string; dashed?: boolean }[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 7 }}>
      {items.map((it) => (
        <View key={it.text} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Svg width={7} height={7} viewBox="0 0 8 8">
            {it.dashed ? <Circle cx={4} cy={4} r={3.3} fill="#ffffff" stroke="#9a9a9a" strokeWidth={0.9} strokeDasharray="1.4,1.2" /> : <Circle cx={4} cy={4} r={4} fill={it.fill} />}
          </Svg>
          <Text style={{ fontSize: 6.8, color: MUTED }}>{it.text}</Text>
        </View>
      ))}
    </View>
  );
}

const AI_LEGEND = [{ fill: DATA_HEX.g1, text: "Named, top 3" }, { fill: DATA_HEX.amber, text: "Named 4th-5th" }, { fill: "#dcdcdc", text: "Not named" }, { fill: "#f0f0f0", text: "! No result" }, { fill: "", text: "Not checked", dashed: true }];
const MAPS_LEGEND = [{ fill: DATA_HEX.g1, text: "1-3" }, { fill: DATA_HEX.amber, text: "4-10" }, { fill: DATA_HEX.orange, text: "11-20" }, { fill: DATA_HEX.red, text: "Not in top 20" }, { fill: "#f0f0f0", text: "! No result" }, { fill: "", text: "Not checked", dashed: true }];

function Eyebrow({ n, text, color }: { n: string; text: string; color: string }) {
  return <Text style={[s.eyebrow, { color }]}><Text style={{ color: "#8a8a8a" }}>{n}  </Text>{text}</Text>;
}

function StatBox({ stat }: { stat: HeadlineStat }) {
  const share = stat.share ?? 0;
  const fill = stat.key === "audit" ? (Number(stat.value) >= 70 ? DATA_HEX.g1 : Number(stat.value) >= 50 ? DATA_HEX.amber : DATA_HEX.orange) : DATA_HEX.g1;
  return (
    <View style={[s.box, { flex: 1, gap: 4 }]}>
      <Text style={s.label}>{stat.label}</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3 }}>
        <Text style={{ fontSize: 24, fontFamily: "Helvetica-Bold", lineHeight: 1 }}>{stat.value}</Text>
        {stat.of ? <Text style={{ fontSize: 11, color: MUTED, marginBottom: 1.5 }}>/{stat.of}</Text> : null}
      </View>
      {stat.share != null ? (
        <View style={{ height: 4, backgroundColor: "#ececec", borderRadius: 2, marginTop: 2 }}>
          <View style={{ height: 4, width: `${Math.round(share * 100)}%`, backgroundColor: fill, borderRadius: 2 }} />
        </View>
      ) : null}
      <Text style={{ fontSize: 8, color: MUTED, lineHeight: 1.3 }}>{safe(stat.caption)}</Text>
    </View>
  );
}

function RankListPdf({ title, sub, total, rows }: { title: string; sub: string; total: number; rows: { name: string; you: boolean; value: number }[] }) {
  return (
    <View style={[s.box, { flex: 1 }]} wrap={false}>
      <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>{title}</Text>
      <Text style={[s.small, { marginBottom: 6 }]}>{safe(sub)}</Text>
      {rows.map((r, i) => (
        <View key={`${r.name}-${i}`} style={{ paddingVertical: 3.5, paddingHorizontal: 4, borderRadius: 3, backgroundColor: r.you ? YOU_BG : undefined }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 6 }}>
            <Text style={{ fontSize: 8.8, flex: 1, fontFamily: r.you ? "Helvetica-Bold" : "Helvetica", color: r.you ? YOU_INK : INK }}>{safe(r.name)}{r.you ? "  (this business)" : ""}</Text>
            <Text style={{ fontSize: 8.8, fontFamily: "Helvetica-Bold" }}>{r.value}<Text style={{ fontFamily: "Helvetica", color: MUTED }}>/{total}</Text></Text>
          </View>
          <View style={{ height: 3, backgroundColor: "#ececec", borderRadius: 1.5, marginTop: 2.5 }}>
            <View style={{ height: 3, width: `${total ? Math.round((r.value / total) * 100) : 0}%`, backgroundColor: r.you ? DATA_HEX.g1 : "#8c8c8c", borderRadius: 1.5 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

const PDF_ANSWER_CHARS = 1800;

function QuoteText({ blocks }: { blocks: QuoteBlock[] }) {
  return (
    <View style={{ gap: 3, borderLeftWidth: 1.5, borderLeftColor: LINE, paddingLeft: 7 }}>
      {blocks.map((b, i) => (
        <Text key={i} style={{ fontSize: 8.6, color: BODY, lineHeight: 1.42, fontFamily: b.kind === "h" ? "Helvetica-Bold" : "Helvetica" }}>
          {b.marker ? `${b.marker} ` : ""}
          {b.spans.map((sp, j) => (
            <Text key={j} style={{ fontFamily: sp.bold || sp.you ? "Helvetica-Bold" : undefined, color: sp.you ? YOU_INK : sp.bold ? INK : undefined, backgroundColor: sp.you ? YOU_BG : undefined }}>
              {safe(sp.text)}
            </Text>
          ))}
        </Text>
      ))}
    </View>
  );
}

function AnswerPdf({ a, businessName }: { a: QuotedAnswer; businessName: string }) {
  const full = a.answer ?? "";
  const cut = full.length > PDF_ANSWER_CHARS;
  const shown = cut ? full.slice(0, PDF_ANSWER_CHARS).replace(/\s+\S*$/, "") : full;
  const blocks = shown ? quoteBlocks(shown, [...a.names.filter((x) => x.you).map((x) => x.name), businessName]) : [];
  const dropped = pdfText(shown).dropped;
  const state = a.state === "named" ? (a.position ? `Named #${a.position}` : "Named") : a.state === "not_named" ? "Not named" : "No answer";
  return (
    <View style={[s.box, { marginTop: 8 }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }} wrap={false}>
        <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold" }}>{a.label}</Text>
        <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: a.state === "named" ? YOU_INK : MUTED, backgroundColor: a.state === "named" ? YOU_BG : SOFT, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>{state}</Text>
      </View>
      {a.state === "no_answer" ? (
        <Text style={[s.small, { marginTop: 4 }]}>This assistant did not return an answer for this check.</Text>
      ) : (
        <>
          <Text style={{ fontSize: 8.6, marginTop: 5, lineHeight: 1.45 }}>
            <Text style={{ color: MUTED }}>Named, in order: </Text>
            {a.names.length
              ? a.names.map((x, i) => (
                  <Text key={i} style={{ fontFamily: x.you ? "Helvetica-Bold" : "Helvetica", color: x.you ? YOU_INK : INK, backgroundColor: x.you ? YOU_BG : undefined }}>
                    {`${i ? "   " : ""}${x.position}. ${safe(x.name)}`}
                  </Text>
                ))
              : "no specific business"}
          </Text>
          {blocks.length ? (
            <View style={{ marginTop: 6 }}>
              <QuoteText blocks={blocks} />
              {cut || a.answerCut ? <Text style={[s.small, { marginTop: 3 }]}>[The answer continues; the full text is in the live report.]</Text> : null}
              {dropped ? <Text style={[s.small, { marginTop: 3 }]}>[Characters this PDF font cannot draw, such as emoji, are left out.]</Text> : null}
            </View>
          ) : null}
          {a.cited.length ? <Text style={[s.small, { marginTop: 5 }]}>Cited: {[...new Set(a.cited.map((c) => c.domain))].join(", ")}</Text> : null}
        </>
      )}
    </View>
  );
}

function Qr({ url, size = 62 }: { url: string; size?: number }) {
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

const miles = (m: number | null, centred?: boolean) => (m ? ` within ${Number.isInteger(m) ? m : m.toFixed(1)} ${m === 1 ? "mile" : "miles"} of ${aroundPlace(centred)}` : "");

// ───────────────────────── document ─────────────────────────

export function ReportDocument({ view, liveUrl, logo }: { view: ReportView; liveUrl: string; logo?: { data: Buffer; format: "png" | "jpg" } | null }) {
  const { business, brand, ai, maps, audit } = view;
  const accent = isHex6(brand.color) ? brand.color : brand.name || brand.hideRankbyai ? INK : ORANGE;
  const stats = headlineStats(view);
  const aiGrid = ai && ai.n > 1 ? ai : null;
  const mapsGrid = maps && !maps.single && maps.n > 1 ? maps : null;
  const aiRows = aiGrid && aiGrid.pointsChecked > 0 && aiGrid.recommended.some((r) => !r.you) ? aiGrid.recommended.map((r) => ({ name: r.name, you: r.you, value: r.points })) : null;
  const mapsRows = mapsGrid && mapsGrid.pointsDone > 0 && mapsGrid.competitors.length
    ? [...mapsGrid.competitors.slice(0, 5).map((c) => ({ name: c.name, you: false, value: c.top3Points })), { name: business.name, you: true, value: mapsGrid.top3Points }].sort((a, b) => b.value - a.value || (a.you ? -1 : 1))
    : null;
  const said = !!ai?.quote && ai.quote.answers.some((a) => a.state !== "no_answer");
  const shown = { map: !!(aiGrid || mapsGrid), instead: !!(aiRows || mapsRows), said, maps1: !!maps?.single, sources: !!ai?.sources.length, fix: !!audit };
  const order = (Object.keys(shown) as (keyof typeof shown)[]).filter((k) => shown[k]);
  const num = (k: keyof typeof shown) => String(order.indexOf(k) + 1).padStart(2, "0");
  const showRankbyai = !brand.hideRankbyai && !brand.name;
  const gridSize = aiGrid && mapsGrid ? 196 : 240;

  return (
    <Document title={`${business.name}: AI visibility report`} author={brand.name ?? (brand.hideRankbyai ? undefined : "RankbyAI")} creator={brand.hideRankbyai ? brand.name ?? undefined : "RankbyAI"} producer={brand.hideRankbyai ? brand.name ?? undefined : "RankbyAI"}>
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            {/* react-pdf images take no alt text; the agency name is printed next to it */}
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {logo ? <Image src={logo} style={{ height: 22, maxWidth: 110, objectFit: "contain" }} /> : null}
            {brand.name ? <Text style={s.brand}>{safe(brand.name)}</Text> : brand.hideRankbyai ? <Text style={[s.brand, { fontSize: 10 }]}>AI visibility report</Text> : (
              <>
                <DotMarkPdf />
                <Text style={s.brand}>RankbyAI</Text>
              </>
            )}
          </View>
          <Text style={s.meta}>Data from {dataDates(view)}</Text>
        </View>

        {/* The finding */}
        <Text style={[s.eyebrow, { color: accent }]}>{view.kind === "free_check" ? "Free AI visibility check" : "AI visibility report"}</Text>
        <Text style={s.h1}>{safe(business.name)}</Text>
        {[business.category, placeOf(view)].some(Boolean) ? <Text style={s.sub}>{safe([business.category, placeOf(view)].filter(Boolean).join(" · "))}</Text> : null}
        <Text style={[s.verdict, { borderLeftColor: accent }]}>{safe(verdict(view))}</Text>
        {view.watermark ? <Text style={[s.small, { marginTop: 8 }]}>This is a free check of one point: the business location. A full report checks a grid of points around the business and audits its profile and website.</Text> : null}
        {stats.length ? (
          <View style={{ flexDirection: "row", gap: 9, marginTop: 16 }} wrap={false}>
            {stats.map((st) => <StatBox key={st.key} stat={st} />)}
          </View>
        ) : null}

        {/* The map */}
        {aiGrid || mapsGrid ? (
          <View style={s.section} wrap={false}>
            <Eyebrow n={num("map")} text="The map" color={accent} />
            <Text style={s.h2}>{safe(business.name.length > 40 ? "Where the business shows up" : `Where ${business.name} shows up`)}</Text>
            <Text style={s.lead}>Each dot is one point on a grid around {aroundPlace(aiGrid?.centredOnBusiness !== false && mapsGrid?.centredOnBusiness !== false)}. From every point {aiGrid && mapsGrid ? "the AI assistants were asked for a recommendation and Google Maps was searched" : aiGrid ? "the AI assistants were asked for a recommendation" : "Google Maps was searched"}.</Text>
            <View style={{ flexDirection: "row", gap: 14 }}>
              {aiGrid ? (
                <View style={[s.box, { flex: 1, alignItems: "center" }]}>
                  <Text style={{ fontSize: 9.5, fontFamily: "Helvetica-Bold", alignSelf: "flex-start" }}>AI assistants: named at {aiGrid.pointsMentioned} of {aiGrid.pointsChecked} points</Text>
                  <Text style={[s.small, { alignSelf: "flex-start", marginBottom: 8 }]}>{aiGrid.n}×{aiGrid.n} grid · {fmtDay(aiGrid.date, "short")} · number = assistants naming it</Text>
                  <DotGridPdf n={aiGrid.n} size={gridSize} looks={aiGrid.points.map(aiPointLook)} />
                  <Legend items={AI_LEGEND} />
                </View>
              ) : null}
              {mapsGrid ? (
                <View style={[s.box, { flex: 1, alignItems: "center" }]}>
                  <Text style={{ fontSize: 9.5, fontFamily: "Helvetica-Bold", alignSelf: "flex-start" }}>Google Maps: top 3 at {mapsGrid.top3Points} of {mapsGrid.pointsDone} points</Text>
                  <Text style={[s.small, { alignSelf: "flex-start", marginBottom: 8 }]}>{safe(`“${mapsGrid.keyword ?? ""}”`)} · {mapsGrid.n}×{mapsGrid.n} grid · {fmtDay(mapsGrid.date, "short")} · number = rank</Text>
                  <DotGridPdf n={mapsGrid.n} size={gridSize} looks={mapsGrid.points.map(mapsPointLook)} />
                  <Legend items={MAPS_LEGEND} />
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Who instead */}
        {aiRows || mapsRows ? (
          <View style={s.section} wrap={false}>
            <Eyebrow n={num("instead")} text="Who instead" color={accent} />
            <Text style={s.h2}>{aiRows ? "Who AI recommends instead" : "Who ranks instead"}</Text>
            <Text style={s.lead}>{safe(`${aiRows ? "The businesses the assistants named most often across the grid" : "The businesses in the Google Maps top 3 most often across the grid"}, and at how many points. ${business.name} is in the list for comparison.`)}</Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              {aiRows && aiGrid ? <RankListPdf title="Named by AI assistants" sub={`Points where at least one assistant named it, of ${aiGrid.pointsChecked}`} total={aiGrid.pointsChecked} rows={aiRows} /> : null}
              {mapsRows && mapsGrid ? <RankListPdf title="In the Google Maps top 3" sub={`Points in the top 3 for “${mapsGrid.keyword ?? ""}”, of ${mapsGrid.pointsDone}`} total={mapsGrid.pointsDone} rows={mapsRows} /> : null}
            </View>
          </View>
        ) : null}

        {/* The proof */}
        {said && ai?.quote ? (
          <View style={s.section}>
            <View wrap={false}>
              <Eyebrow n={num("said")} text="The proof" color={accent} />
              <Text style={s.h2}>What the AI said</Text>
              <Text style={s.lead}>
                {ai.n === 1 ? `Asked at ${atPlace(ai.centredOnBusiness)}` : `Asked at point ${ai.quote.pointName}${ai.quote.area ? ` (${safe(ai.quote.area)})` : ""}, ${ai.quote.atBusiness ? "where the business is" : "the checked point nearest the business"},`} on {fmtDay(ai.date)}. Quoted exactly as each assistant answered.
              </Text>
              {ai.quote.prompt ? (
                <View style={{ backgroundColor: SOFT, borderRadius: 5, padding: 8 }}>
                  <Text style={s.label}>The question, as sent to every assistant</Text>
                  <Text style={{ fontSize: 8.8, fontFamily: "Courier", marginTop: 3, lineHeight: 1.4 }}>{safe(`“${ai.quote.prompt}”`)}</Text>
                </View>
              ) : null}
            </View>
            {ai.quote.answers.map((a) => <AnswerPdf key={a.engine} a={a} businessName={business.name} />)}
          </View>
        ) : null}

        {/* Free check: Google Maps at the business */}
        {maps?.single ? (
          <View style={s.section} wrap={false}>
            <Eyebrow n={num("maps1")} text="Google Maps" color={accent} />
            <Text style={s.h2}>{maps.centredOnBusiness === false ? "Google Maps at the chosen point" : "Google Maps at the business location"}</Text>
            <Text style={s.lead}>{safe(`The local results for “${maps.keyword ?? ""}” at ${atPlace(maps.centredOnBusiness)} on ${fmtDay(maps.date)}.`)}</Text>
            <View style={s.box}>
              {maps.single.top.map((t) => {
                const you = t.rank === maps.single!.rank;
                return (
                  <Text key={t.rank} style={{ fontSize: 9.5, paddingVertical: 2.5, paddingHorizontal: 4, fontFamily: you ? "Helvetica-Bold" : "Helvetica", color: you ? YOU_INK : INK, backgroundColor: you ? YOU_BG : undefined }}>
                    {t.rank}.  {safe(t.name)}{you ? "  (this business)" : ""}
                  </Text>
                );
              })}
              {maps.single.rank == null || maps.single.rank > (maps.single.top.at(-1)?.rank ?? 0) ? (
                <Text style={[s.small, { marginTop: 3 }]}>{safe(maps.single.rank != null && maps.single.rank <= 20 ? `${business.name} is at #${maps.single.rank}.` : `${business.name} is not in the top 20.`)}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Where AI looks */}
        {ai && ai.sources.length ? (
          <View style={s.section} wrap={false}>
            <Eyebrow n={num("sources")} text="Where AI looks" color={accent} />
            <Text style={s.h2}>Where AI gets its answers</Text>
            <Text style={s.lead}>{safe(`The sites the assistants cited most while answering. These are the first places to check that ${business.name} is listed, with correct details and recent reviews.`)}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {ai.sources.map((src, i) => (
                <View key={src.domain} style={[s.box, { width: "49%", flexDirection: "row", gap: 6, paddingVertical: 7 }]}>
                  <Text style={{ fontSize: 8, color: MUTED }}>{String(i + 1).padStart(2, "0")}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 9.5, fontFamily: "Helvetica-Bold" }}>{safe(src.domain)}</Text>
                    <Text style={s.small}>Cited in {src.count} of {ai.answersDone} answers{src.engines.length ? ` · ${src.engines.join(", ")}` : ""}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* What to fix */}
        {audit ? (
          <View style={s.section}>
            <View wrap={false}>
              <Eyebrow n={num("fix")} text="Local AI Audit" color={accent} />
              <Text style={s.h2}>Fix these first</Text>
              <Text style={s.lead}>Checks of the business&apos;s Google profile and website on {fmtDay(audit.date)}. Score: {audit.score} out of 100. P0: fix first. P1: fix next.</Text>
            </View>
            {audit.findings.length === 0 ? <Text style={{ fontSize: 9.5, color: MUTED }}>No high-priority issues were found.</Text> : audit.findings.map((f, i) => (
              <View key={i} style={[s.box, { flexDirection: "row", gap: 8, marginTop: 6 }]} wrap={false}>
                <View style={[s.badge, { backgroundColor: BADGE[f.priority] ?? "#6b6b6b" }]}><Text style={s.badgeText}>{f.priority}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 9.8, fontFamily: "Helvetica-Bold" }}>{safe(f.title)}</Text>
                  {f.fix ? <Text style={{ fontSize: 9, color: BODY, marginTop: 2 }}>{safe(f.fix)}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* What happens next */}
        <View style={[s.section, s.box, { borderColor: isHex6(brand.color) ? brand.color : LINE, borderWidth: 1.2, padding: 12 }]} wrap={false}>
          {brand.name ? (
            <>
              <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold" }}>{safe(brand.website ? `Get this fixed with ${brand.name}` : `Prepared by ${brand.name}`)}</Text>
              <Text style={{ fontSize: 9.5, color: BODY, marginTop: 3 }}>{safe(`${brand.name} prepared this report for ${business.name}. Talk to them about the fixes above, and ask for a new check afterwards to compare.`)}</Text>
              {brand.website ? <Link src={brand.website} style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: isHex6(brand.color) ? brand.color : INK, marginTop: 5 }}>{safe(brand.website.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</Link> : null}
            </>
          ) : (
            <>
              <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold" }}>Want these fixed?</Text>
              <Text style={{ fontSize: 9.5, color: BODY, marginTop: 3 }}>Share this report with your marketing agency or web developer. Everything they need is in it, and the live link below always opens the report.</Text>
              {!view.brand.name && fixPrompt(view) ? (
                <Text style={{ fontSize: 9.5, color: BODY, marginTop: 4 }}>Doing it yourself? The live report has every fix written as one prompt to paste into ChatGPT, Claude or Gemini.</Text>
              ) : null}
              {showRankbyai ? (
                <Text style={{ fontSize: 9, color: MUTED, marginTop: 6 }}>
                  {view.kind === "free_check" ? "This was one point. A full report checks a grid of points around the business and audits it: " : "Agencies make reports like this for every prospect with RankbyAI: "}
                  <Link src={publicEnv.siteUrl} style={{ color: INK }}>{publicEnv.siteUrl.replace(/^https?:\/\//, "")}</Link>
                </Text>
              ) : null}
            </>
          )}
        </View>

        {/* Method */}
        <View style={[s.section, { borderTopWidth: 1, borderTopColor: LINE, paddingTop: 10, gap: 5 }]} wrap={false}>
          <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold" }}>How this report was made</Text>
          {ai ? (
            <Text style={{ fontSize: 8, color: BODY }}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>AI assistants. </Text>
              {ai.n === 1 ? `At ${atPlace(ai.centredOnBusiness)}` : `At ${ai.pointsChecked} points of a ${ai.n}×${ai.n} grid${miles(ai.radiusMiles, ai.centredOnBusiness)}`}, on {fmtDay(ai.date)}, through the official APIs: {orList(ai.engines.map((e) => `${ENGINE_LABEL[e.key]?.api ?? e.label} (${e.label})`), "and")}. Every assistant got the same question{ai.n > 1 ? "; only the area name changes between points" : ""}.
            </Text>
          ) : null}
          {maps ? (
            <Text style={{ fontSize: 8, color: BODY }}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Google Maps. </Text>
              {maps.single ? `At ${atPlace(maps.centredOnBusiness)}` : `At ${maps.pointsDone} points of a ${maps.n}×${maps.n} grid${miles(maps.radiusMiles, maps.centredOnBusiness)}`}, on {fmtDay(maps.date)}: the local results for {safe(`“${maps.keyword ?? ""}”`)}, via DataForSEO. Outside the top 20 counts as not ranked.
            </Text>
          ) : null}
          {audit ? <Text style={{ fontSize: 8, color: BODY }}><Text style={{ fontFamily: "Helvetica-Bold" }}>Local AI Audit. </Text>On {fmtDay(audit.date)}: checks of the business&apos;s Google profile and website, scored out of 100.</Text> : null}
          <Text style={{ fontSize: 8, color: BODY }}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>What is counted. </Text>
            Fixed points and dates. Points with no result (!) and areas left out of the scan (dashed) are not counted{ai ? "; an assistant that did not answer is not counted as \"not named\"" : ""}. This is a snapshot of the dates above, not a guarantee of future results.
          </Text>
          {!brand.hideRankbyai ? <Text style={{ fontSize: 7.5, color: MUTED }}>{NOT_AFFILIATED}</Text> : null}
        </View>

        <View style={s.footer} fixed>
          <View style={{ width: 410, gap: 3 }}>
            {ai ? <Text style={{ fontSize: 7.2, color: MUTED }}>{AI_DISCLAIMER_TEXT}</Text> : null}
            <Text style={{ fontSize: 7.5, color: MUTED }}>Live report: <Link src={liveUrl} style={{ color: INK }}>{liveUrl.replace(/^https?:\/\//, "")}</Link></Text>
          </View>
          <Qr url={liveUrl} />
        </View>
      </Page>
    </Document>
  );
}

/** The agency logo for the header, when it is a PNG or JPEG that loads quickly; otherwise none (the name still shows). */
async function loadLogo(url: string | null): Promise<{ data: Buffer; format: "png" | "jpg" } | null> {
  if (!url) return null;
  try {
    if (url.startsWith("data:")) {
      const m = url.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
      return m ? { data: Buffer.from(m[2], "base64"), format: m[1].toLowerCase() === "png" ? "png" : "jpg" } : null;
    }
    if (!/^https:\/\//i.test(url)) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/image\/(png|jpe?g)/i.test(type)) return null;
    const data = Buffer.from(await res.arrayBuffer());
    return data.length && data.length < 2_000_000 ? { data, format: /png/i.test(type) ? "png" : "jpg" } : null;
  } catch {
    return null;
  }
}

export const renderReportPdf = async (view: ReportView, liveUrl: string): Promise<Buffer> =>
  renderToBuffer(<ReportDocument view={view} liveUrl={liveUrl} logo={await loadLogo(view.brand.logoUrl)} />);

export const pdfFileName = (businessName: string) => `${businessName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "report"}-ai-visibility.pdf`;

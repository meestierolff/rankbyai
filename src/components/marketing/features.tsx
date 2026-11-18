"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { track } from "@/lib/analytics";
import { MAPS_GRID_RANGE } from "@/lib/pricing-constants";
import { cn } from "@/lib/utils";
import { AiVisibilityPreview, AuditPreview, MapsGridPreview, ProspectsPreview } from "./feature-mocks";
import { Bezel, LpSampleTag } from "./lp";

/* The four tools. The copy (headline, description, bullets) is the product's own and is rendered for
   every tool, so it is in the HTML even for the tabs that are not open. */
const TOOLS = [
  {
    key: "ai", n: "01", label: "AI Visibility", title: "AI Visibility Tracker", url: "rankbyai.live/app/ai-visibility",
    headline: "See which businesses AI assistants recommend, street by street.",
    desc: "One prompt, asked of three AI engines at every point of a map grid. Click any point to read the full answer, who was named in what order, and which sources were cited.",
    bullets: [
      "1×1, 3×3 or 5×5 AI grids with your own radius",
      "Three engines per point: ChatGPT, Perplexity and Gemini, through their official APIs",
      "Click any point for the full answer, the order of names and the cited sources",
      "Mention rate, average position and Share of AI Voice",
      "Scheduled re-checks with history and side-by-side compare",
      "Most-cited sources: the list of where to get listed",
    ],
  },
  {
    key: "maps", n: "02", label: "Maps Grid", title: "Maps Grid Tracker", url: "rankbyai.live/app/maps-grid",
    headline: "Your Google Maps rank on the same map.",
    desc: `The classic geo-grid, from ${MAPS_GRID_RANGE}, next to the AI grid for the same business. See where you are top 3 on Maps but missing from AI answers.`,
    bullets: [
      `Grids from ${MAPS_GRID_RANGE} with your own radius`,
      "Skip points you do not track, such as water or a park: they are not looked up",
      "Top 20 results at any pin, with you highlighted",
      "Competitor overlay: recolor the grid by any rival's rank",
      "Average rank, top-3 share and Share of Local Voice",
      "Schedules, history and before/after compare",
      "Combined view: Maps rank and AI mentions on one map",
    ],
  },
  {
    key: "audit", n: "03", label: "Local AI Audit", title: "Local AI Audit + Fix Kit", url: "rankbyai.live/app/audit",
    headline: "What's holding the business back, in priority order.",
    desc: "One score out of 100 across identity, profile, website, reviews, AI presence and competition. Every finding comes with its evidence and a fix. Checks that could not run are left out of the score and listed.",
    bullets: [
      "One 0–100 score with published category weights",
      "P0 to P3 findings, each with evidence and a fix",
      "Review target math: how many reviews a month to reach the map pack median",
      "Missing service pages, found on competitor sites, with the URL as evidence",
      "Page math: services × areas within 10 miles",
      "Fix Kit: AI-ready description, FAQ, LocalBusiness + FAQ schema, llms.txt draft",
    ],
  },
  {
    key: "prospects", n: "04", label: "Prospect Reports", title: "Prospect Reports", url: "rankbyai.live/app/prospects",
    headline: "Win the client before the first call.",
    desc: "Pick a niche and a city. RankbyAI finds the businesses, checks each one and builds a white-label report with a live link, a PDF and a factual pitch opener for your own outreach.",
    bullets: [
      "Niche + city in, dozens of businesses out",
      "One white-label report each: AI grid, Maps grid, top fixes, pitch opener",
      "Live share link plus PDF, under your logo and colors",
      "CSV export for your own outreach tool",
      "Bulk runs through the API or the MCP server",
    ],
  },
] as const;

type ToolKey = (typeof TOOLS)[number]["key"];

const PANELS: Record<ToolKey, () => ReactNode> = {
  ai: AiVisibilityPreview,
  maps: MapsGridPreview,
  audit: AuditPreview,
  prospects: ProspectsPreview,
};

/** Four tools, one payment: a tabbed, interactive preview of each tool on sample data. */
export function Features() {
  const [tab, setTab] = useState<ToolKey>("ai");
  // A panel is mounted the first time its tab opens and then kept, so its state survives tab switches.
  const [opened, setOpened] = useState<readonly ToolKey[]>(["ai"]);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const index = TOOLS.findIndex((t) => t.key === tab);
  const tool = TOOLS[index];
  const next = TOOLS[(index + 1) % TOOLS.length];

  const open = (key: ToolKey) => {
    if (key === tab) return;
    setTab(key);
    setOpened((o) => (o.includes(key) ? o : [...o, key]));
    track("demo_interacted", { target: "tool_tab", tool: key });
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = TOOLS.length - 1;
    const to =
      e.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : -1;
    if (to < 0) return;
    e.preventDefault();
    open(TOOLS[to].key);
    tabRefs.current[to]?.focus();
  };

  return (
    <section id="product" aria-labelledby="product-heading" className="relative overflow-x-clip pt-[150px] pb-[140px]">
      <div
        aria-hidden
        className="pointer-events-none absolute top-[360px] left-1/2 -ml-[700px] h-[1000px] w-[1400px] bg-[radial-gradient(closest-side,rgba(255,110,30,0.1),rgba(255,110,30,0)_100%)]"
      />

      <div className="container-lp relative text-center">
        <h2 id="product-heading" className="lp-h2 m-0">Track it. Audit it. Fix it. Sell it.</h2>
        <p className="mx-auto mt-[22px] mb-0 text-[clamp(17px,2vw,21px)] leading-[1.5] text-lp-muted">
          Four tools, one payment. Every scan runs on your own keys.
        </p>
      </div>

      <div role="tablist" aria-label="The four tools" className="container-lp relative mt-12 mb-9 flex flex-wrap justify-center gap-[6px]">
        {TOOLS.map((t, i) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`product-tab-${t.key}`}
              aria-selected={active}
              aria-controls={`product-panel-${t.key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => open(t.key)}
              onKeyDown={onTabKey}
              className={cn(
                "flex cursor-pointer items-center gap-[10px] rounded-xl border px-[18px] py-3 text-[16px] transition-all duration-200",
                active ? "border-lp-border-2 bg-[#141414] text-lp-fg" : "border-transparent bg-transparent text-lp-muted hover:text-lp-fg",
              )}
            >
              <span aria-hidden className={cn("font-mono text-[12px]", active ? "text-lp-accent-text" : "text-[#5a5a5a]")}>{t.n}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="container-lp relative">
        <Bezel warm large>
          <div className="flex items-center justify-between gap-4 border-b border-lp-line px-[clamp(14px,3vw,22px)] py-4">
            <div className="flex min-w-0 items-center gap-[14px]">
              <div
                aria-hidden
                className="grid size-9 flex-none place-items-center rounded-[10px] border border-[rgba(255,122,26,0.4)] bg-[rgba(255,122,26,0.1)] font-mono text-[12px] text-lp-accent-text"
              >
                {tool.n}
              </div>
              <div className="min-w-0">
                <div className="text-[17px] leading-[1.25] font-medium">{tool.title}</div>
                <div className="mt-[2px] truncate font-mono text-[11.5px] text-lp-faint">{tool.url}</div>
              </div>
            </div>
            <div className="flex flex-none items-center gap-3">
              <LpSampleTag />
              <span className="hidden font-mono text-[11px] tracking-[0.16em] whitespace-nowrap text-lp-faint uppercase sm:inline">Interactive preview</span>
            </div>
          </div>
          <div className="min-h-[560px] p-[clamp(16px,3vw,28px)]">
            {TOOLS.map((t) => {
              const Panel = PANELS[t.key];
              return (
                <div key={t.key} role="tabpanel" id={`product-panel-${t.key}`} aria-labelledby={`product-tab-${t.key}`} hidden={t.key !== tab}>
                  {opened.includes(t.key) ? <Panel /> : null}
                </div>
              );
            })}
          </div>
        </Bezel>
      </div>

      <div className="container-lp relative mt-11">
        <div className="flex flex-wrap items-baseline justify-between gap-5">
          {TOOLS.map((t) => (
            <h3 key={t.key} hidden={t.key !== tab} className="m-0 max-w-[640px] text-[24px] leading-[1.25] font-medium tracking-[-0.02em]">
              {t.headline}
            </h3>
          ))}
          <button
            type="button"
            onClick={() => open(next.key)}
            className="flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-[15px] text-[#ece9e4] transition-colors hover:text-white"
          >
            Next: {next.label} <span aria-hidden className="text-[#8a8a8a]">›</span>
          </button>
        </div>
        {TOOLS.map((t) => (
          <div key={t.key} hidden={t.key !== tab}>
            <p className="mt-3 mb-0 max-w-[700px] text-[16.5px] leading-[1.6] text-lp-muted">{t.desc}</p>
            <ul className="m-0 mt-[26px] grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-x-8 gap-y-[10px] p-0">
              {t.bullets.map((b) => (
                <li key={b} className="flex gap-[10px] border-t border-[#161616] pt-[10px] text-[14.5px] leading-[1.5] text-[#b5b2ad]">
                  <span aria-hidden className="text-lp-accent-text">✓</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

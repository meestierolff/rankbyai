import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/brand/primitives";
import { GuideOfferLine } from "@/components/marketing/guide-offer-line";
import { OfferProvider } from "@/components/marketing/offer-context";
import { PageShell } from "@/components/marketing/page-shell";
import { AI_CITATION_GUIDE as guide } from "@/lib/ai-citation-guide";
import { getOfferCached } from "@/lib/offer";

// The one price sentence reads the cached live offer, which may need refreshing before this page
// renders (same as the audit page). Allow a blocking navigation rather than a guessed price.
export const instant = false;

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: guide.path },
  robots: guide.listed ? { index: true, follow: true } : { index: false, follow: true },
  openGraph: { title: guide.socialTitle, description: guide.description, url: guide.path, type: "article" },
  twitter: { card: "summary_large_image", title: guide.socialTitle, description: guide.description },
};

const PROMPTS = [
  "Best {service} near me",
  "Best {service} in {city}",
  "Best {service} near {neighbourhood}",
  "Who should I hire for {service} in {city}?",
  "{service} open now near me",
  "Affordable {service} in {city}",
  "Alternatives to {competitor} for {service} in {city}",
  "{competitor A} vs {competitor B} for {service} in {city}",
  "Best {service} for {situation} in {city}",
  "Recommended {service} in {area}",
];

const PLUMBER = [
  "Best plumber near me",
  "Best plumber in {city}",
  "Best plumber near {neighbourhood}",
  "Who should I hire for plumbing in {city}?",
  "Emergency plumber open now near me",
  "Affordable plumber in {city}",
  "Alternatives to {competitor} for plumber in {city}",
  "{competitor A} vs {competitor B} for plumber in {city}",
  "Best plumber for emergency in {city}",
  "Recommended plumber in {area}",
];

const BACKLINK_FILTER = `[
  ["url_from", "ilike", "%best%"],
  "or",
  ["url_from", "ilike", "%top-%"],
  "or",
  ["url_from", "ilike", "%review%"]
]`;

const CURSOR_CONFIG = `{
  "mcpServers": {
    "rankbyai": {
      "url": "https://rankbyai.live/api/mcp"
    }
  }
}`;

export default async function Page() {
  const result = await getOfferCached();
  const initial = result.available ? { ...result.offer, paidTotal: result.paidTotal } : null;
  const updated = new Date(guide.updated).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <PageShell>
      <article className="container-page pt-[clamp(56px,8vw,104px)] pb-[var(--rb-section-y)]">
        <div className="mx-auto flex max-w-[760px] flex-col gap-5">
          <Eyebrow>{guide.eyebrow}</Eyebrow>
          <h1 className="m-0 text-[clamp(34px,4.8vw,56px)] leading-[1.05] font-semibold tracking-[-0.04em] text-balance">{guide.h1}</h1>
          <p className="m-0 font-mono text-[13px] text-dim">By Mees Tierolff, maker of RankbyAI · Updated {updated}</p>
          <p className="text-lead m-0">
            A practical pack for local SEO agencies and freelancers: 10 buyer prompts you can run today, a repeatable citation-and-backlink gap workflow, and a real
            $0.66 teardown that shows why a tight grid can flatter a client — and a wide one wins the conversation.
          </p>
          <p className="m-0 text-[15px] leading-relaxed text-muted-foreground">
            There is no guaranteed ranking in ChatGPT, Gemini or Perplexity. Answers vary between runs, places and time, and API answers can differ from what
            someone sees in the consumer apps. Treat every result in this pack as a dated observation, not a fixed rank and not a promise of more jobs.
          </p>

          <div className="rb-prose mt-4">
            <h2 id="prompts">10 local buyer prompts (copy and fill in)</h2>
            <p>
              A buyer rarely types the one keyword you track on Maps. Run a short pack of the questions they actually ask, on <strong>ChatGPT, Gemini and Perplexity</strong>,
              and write down the names and the citations every time.
            </p>
            <p>Replace the braces. Keep the wording natural. Use the same pack later so you can compare.</p>
            <ol>
              {PROMPTS.map((p, i) => (
                <li key={p}>
                  <code>{p}</code>
                  {i === 8 ? <> (for example: emergency, family-owned, 24-hour, commercial)</> : null}
                </li>
              ))}
            </ol>
            <p><strong>Worked example</strong> (a plumber in a mid-size US city — change the words, keep the shapes):</p>
            <ol>{PLUMBER.map((p) => <li key={p}>{p}</li>)}</ol>

            <h3>How to run them by hand</h3>
            <ul>
              <li>Ask each prompt in a fresh chat, from the place the customer would be (or say the neighbourhood in the prompt if you cannot set a location).</li>
              <li>Record the date, the engine, the exact prompt, who was named and in what order, and every cited URL.</li>
              <li>One answer is not a ranking. If you will compare later, run the same pack twice and keep both runs.</li>
              <li>Then open the cited pages and mark whether your client is actually on the page. An answer can cite a list that leaves them out.</li>
            </ul>

            <h2 id="workflow">The 4-step citation and backlink-gap workflow</h2>
            <p>
              On-page work (titles, schema, FAQs, consistent NAP) is necessary. It is not the whole job. After that, the models can still recommend the competitors —
              because they keep reading pages that already mention those competitors.
            </p>
            <p>This is the loop. Do it by hand with the prompts above, or let an agent run the same path (that part is <a href="#on-rails">at the end</a>).</p>

            <h3 id="step-1">Step 1 — Ask the 10 buyer prompts</h3>
            <p>Run the pack on ChatGPT, Gemini and Perplexity. You want two things from each answer: <strong>who they name</strong>, and <strong>which pages they cite</strong>.</p>
            <p>
              Do this for a local client with place-based prompts (<code>best {"{service}"} near me</code>, <code>in {"{city}"}</code>, <code>near {"{neighbourhood}"}</code>). If the
              product is sold online rather than in a town, drop the place (<code>best {"{category}"} tools</code>) and ask without a map location.
            </p>

            <h3 id="step-2">Step 2 — Save every listicle, review and directory they cite</h3>
            <p>
              Build a simple inventory: URL, domain, rough type (listicle, review, directory, official site, forum, other), which engines cited it, and whether the{" "}
              <strong>client is on the page or missing</strong>.
            </p>
            <p>The useful finding is often not “we were not named in the answer.” It is “the answer leaned on this page, and we are not on it.”</p>
            <p>Those are the pages to get onto — not a random high-authority domain with no traffic and no role in the answers.</p>

            <h3 id="step-3">Step 3 — Find the listicle and directory gaps (the <code>url_from ilike %best%</code> filter)</h3>
            <p>
              Take the top 3 competitors the answers named (you choose; do not invent websites). Pull their backlinks and keep referring pages that look like a best / top
              / review list, plus obvious local tokens.
            </p>
            <p>In <strong>DataForSEO Backlinks</strong> (<code>POST /v3/backlinks/backlinks/live</code>), a filter in this shape is the starting point:</p>
            <pre><code>{BACKLINK_FILTER}</code></pre>
            <p>
              For local work, also allow city and <code>near-me</code> style slugs, and <strong>do not throw out known directories</strong> just because the URL has no “best”
              in it.
            </p>
            <p>
              Then sort those referring pages by <strong>estimated page traffic</strong>, not by a domain-rank vanity score. If you use DataForSEO for traffic, label it as
              DataForSEO’s estimated traffic (<code>etv</code>). It is not Ahrefs “page traffic,” and DataForSEO’s <code>page_rank</code> is not Ahrefs DR.
            </p>
            <p>Merge that list with the cited pages from step 2. The priority order that holds up:</p>
            <ol>
              <li>Pages the models already cited, where the client is missing</li>
              <li>High-traffic best / top / review pages (or directories) that link to competitors but not to the client</li>
              <li>Everything else — usually skip</li>
            </ol>

            <h3 id="step-4">Step 4 — Close the gap on those exact pages</h3>
            <p>The fix matches the page:</p>
            <ul>
              <li><strong>Directory:</strong> claim or complete the listing. Make the name, address, phone and categories match the rest of the footprint.</li>
              <li>
                <strong>Listicle or “best of” article:</strong> pitch the publisher to be added, with a factual reason (service area, genuine reviews, a relevant case). Ask
                them their process and their price; do not guess a fee.
              </li>
              <li>
                <strong>Review or editorial page:</strong> correct wrong facts if you are already mentioned; if you are absent, follow that site’s official path. Never buy
                reviews or gate review requests to happy customers.
              </li>
            </ul>
            <p>
              Get listed on <strong>those exact pages</strong>, and earn the backlink where it is offered. That is different from buying a random DR 70 link farm with little or
              no traffic.
            </p>
            <p>
              Nobody should contact a publisher on your behalf unless you asked them to. This workflow stops at a prioritised list and a clear next action. You (or your
              client) do the outreach.
            </p>
            <p>
              <strong>Repeat the pack later.</strong> Answers, models and cited domains move. A page that was cited in November can drop off in January. Re-run the same
              prompts, then diff mentions and citations, before you spend more placement budget.
            </p>

            <h2 id="teardown">A real $0.66 teardown: 2 miles vs 15 miles</h2>
            <p>
              In late November 2026 I ran both a tight and a wide grid for <strong>a real suburban US local SEO agency outside a major metro</strong>. Same business, two
              radii. The numbers below are from those runs, on our own API keys.
            </p>
            <p><strong>What it cost</strong></p>
            <table>
              <thead>
                <tr><th scope="col">Scan</th><th scope="col">Grid</th><th scope="col">Cost</th></tr>
              </thead>
              <tbody>
                <tr><td>Google Maps</td><td>15 × 15, 15-mile radius</td><td>$0.27</td></tr>
                <tr><td>ChatGPT + Perplexity + Gemini</td><td>5 × 5, 15-mile radius</td><td>$0.39</td></tr>
                <tr><th scope="row">Total</th><td /><td><strong>$0.66</strong></td></tr>
              </tbody>
            </table>
            <p>
              A 2-mile preview of the same business (a 5 × 5 Maps grid and a 3 × 3 AI grid) had already looked strong. The 15-mile run is what I would actually put in
              front of a prospect.
            </p>
            <p><strong>Google Maps</strong></p>
            <ul>
              <li>
                At <strong>2 miles:</strong> #1 on <strong>9 of the 16</strong> grid points that returned Maps results (the other 9 of the 25 points returned none).
              </li>
              <li>
                At <strong>15 miles:</strong> #1 only at their <strong>own address</strong>. Of <strong>225</strong> grid points, <strong>111</strong> returned a result; on the
                other <strong>110</strong> points with a result, they were <strong>not in the top 20</strong>.
              </li>
            </ul>
            <p>
              A 2-mile Maps grid can make a suburban agency look like the obvious local leader. Widen the radius toward the metro and the footprint collapses to the front
              door.
            </p>
            <p><strong>AI visibility (ChatGPT, Perplexity, Gemini)</strong></p>
            <ul>
              <li>At <strong>2 miles:</strong> ChatGPT named them in <strong>67%</strong> of points (6 of 9).</li>
              <li>
                At <strong>15 miles</strong> (5 × 5, 25 points): ChatGPT named them at <strong>7 of 25 points (28%)</strong>. Perplexity named them at <strong>18 of 25</strong>,
                Gemini at <strong>20 of 25</strong>. ChatGPT did not name them even at their own pin; it named five other agencies there instead. At the grid point nearest
                the metro’s downtown, none of the three engines named them.
              </li>
            </ul>
            <p>Same business. Same week. A tight ChatGPT-only check would have sold a much rosier story than the wide grid.</p>
            <p><strong>What the answers were reading</strong></p>
            <p>
              ChatGPT and Perplexity cited third-party lists and directories — including domains such as <code>thefractionalseo.com</code>, <code>ontoplist.com</code>,{" "}
              <code>clutch.co</code> and <code>expertise.com</code>. (Gemini’s sources were Google Maps places.) That is step 2 in the wild: these are the kinds of pages a
              local SEO client needs to be <em>on</em>, if the models are already using them. Open each cited URL and check whether the client is listed before you pitch.
            </p>
            <p><strong>Why this is the lead magnet you can take to a prospect</strong></p>
            <p>
              A 2-mile snapshot is easy to dismiss (“sure, we’re fine near the office”). A 15-mile grid, next to the citations, shows the gap in their actual service area
              — and gives you a concrete next step: get onto the pages the answers already trust. That is useful even if they never buy a tool from you.
            </p>

            <h2 id="on-rails">If you want the same loop on rails</h2>
            <p>
              You can run every step above by hand. If you would rather have an agent do the grid, the prompt pack and the target list on your own API keys, that is what{" "}
              <Link href="/">RankbyAI</Link> is for.
            </p>
            <p>
              RankbyAI is pay-once software for local SEO agencies and freelancers. It measures, at every point of a grid around a business, whether{" "}
              <strong>ChatGPT, Perplexity and Gemini</strong> name it for a “{"{service}"} near me” style question (position, who they name instead, which sources they
              cite), and the business’s <strong>Google Maps</strong> rank on the same kind of grid.
            </p>
            <p>
              On your own keys, at the vendors’ prices, a 15-mile prospect grid like the one above came to <strong>$0.66</strong> ($0.27 for a 15 × 15 Maps scan + $0.39 for a
              5 × 5 AI scan across the three engines). A prompt pack and a citation-target search are estimated separately before anything runs; nothing is charged in the
              background.
            </p>
            <p>The official agent skill is public: <a href="/SKILL.md">https://rankbyai.live/SKILL.md</a></p>

            <h3>What the skill / MCP actually runs today</h3>
            <ol>
              <li>
                Suggest about ten buyer prompts from the business’s stored fields (service, city, area, category, and up to two competitors already named in stored
                answers). You can edit, add or remove prompts. Then run the pack on ChatGPT, Perplexity and Gemini (<code>run_prompt_pack</code>). Default is the map pin,
                one repeat; ask for two repeats if this is a baseline you will compare later.
              </li>
              <li>List the cited pages, including the ones that leave the business out (<code>list_cited_sources</code>, <code>missing_only: true</code>).</li>
              <li>
                After you accept an estimate, find pages that link to up to three competitor sites from a best / top / review list (the linking URL contains{" "}
                <code>best</code>, <code>top-</code>, <code>review</code>, plus city and near-me tokens and known directories for a local business), merge them with the cited
                pages, and sort by DataForSEO estimated traffic (<code>find_citation_targets</code>). Each row gets an action: <code>pitch</code>,{" "}
                <code>directory_claim</code>, or <code>skip</code>. Traffic is DataForSEO <code>etv</code>; <code>page_rank</code> is DataForSEO’s own 0–1000 rank, not Ahrefs
                DR.
              </li>
              <li>You decide who to contact and when. RankbyAI contacts no one and does not send email.</li>
            </ol>
            <p>
              It also does the Local AI Audit (score 0–100, P0–P3 findings with evidence and a fix) and a Fix Kit (profile text, FAQs, LocalBusiness and FAQPage JSON-LD,
              an <code>llms.txt</code> draft), plus white-label share links and PDF reports.
            </p>

            <h3>Connect once (Claude Code)</h3>
            <pre><code>claude mcp add --transport http rankbyai https://rankbyai.live/api/mcp</code></pre>
            <p>Then run <code>/mcp</code> and sign in.</p>
            <h3>Connect once (Cursor)</h3>
            <p><code>.cursor/mcp.json</code> in the project, or <code>~/.cursor/mcp.json</code>:</p>
            <pre><code>{CURSOR_CONFIG}</code></pre>
            <p>
              Cursor will ask you to sign in. You can also use an API key (<code>Authorization: Bearer rbai_live_…</code>) from the app under Developers → API &amp; MCP.
              Paid tools always return an estimate first and do nothing until you confirm.
            </p>

            <h2 id="try-it">Try it, then decide</h2>
            <p>
              <strong>1. Free one-point check</strong> — no account, no card. ChatGPT, Perplexity and Gemini at the business’s own location, plus its Google Maps rank. One
              per person; results stay in the browser that ran them.
            </p>
            <p><Link href="/free-check">https://rankbyai.live/free-check</Link></p>
            <p>
              <strong>2. Pay once, bring your own keys.</strong>{" "}
              <OfferProvider initial={initial}><GuideOfferLine /></OfferProvider>{" "}
              You use your own DataForSEO, OpenAI, Perplexity and Gemini keys at cost. White-label share links and PDFs, REST API and MCP are included. 14-day refund, no
              questions; vendor fees for scans already run cannot be refunded.
            </p>
            <p><Link href="/">https://rankbyai.live/</Link></p>
            <p className="text-[14px]">
              RankbyAI does not guarantee rankings or AI recommendations. The $0.66 figure is the measured API cost of one 15-mile Maps grid plus one 15-mile AI grid on our
              keys in November 2026; your own estimates can differ with grid size, radius, engines and vendor prices.
            </p>
          </div>
        </div>
      </article>
    </PageShell>
  );
}

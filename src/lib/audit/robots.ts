/**
 * robots.txt, read the way search crawlers read it (RFC 9309), to answer one question for the
 * audit: can the crawlers behind search and AI answers fetch this site's pages?
 *
 * Only what robots.txt says is checked. A firewall or bot-protection rule that refuses a crawler
 * at the network level is invisible from here, and the audit says so.
 */

export interface RobotsGroup {
  agents: string[];
  rules: { allow: boolean; pattern: string }[];
}

/** Parses robots.txt into groups. Unknown lines (Sitemap, Crawl-delay, Host, comments) are ignored. */
export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      // Consecutive User-agent lines share one group; a User-agent after rules starts a new one.
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === "allow" || field === "disallow") {
      lastWasAgent = false;
      // An empty Disallow allows everything: it adds no rule.
      if (current && value) current.rules.push({ allow: field === "allow", pattern: value });
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

/** Whether a robots.txt path pattern (with `*` and a trailing `$`) matches the path. */
export function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = body.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${re}${anchored ? "$" : ""}`).test(path);
}

/**
 * Whether `agent` may fetch `path`. The groups naming the agent apply (merged); without one, the
 * `*` groups do. The longest matching rule wins and Allow wins a tie, as Google and Bing apply it.
 */
export function isAllowed(groups: RobotsGroup[], agent: string, path: string): boolean {
  const token = agent.toLowerCase();
  const named = groups.filter((g) => g.agents.includes(token));
  const applicable = named.length ? named : groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of applicable.flatMap((g) => g.rules)) {
    if (!patternMatches(rule.pattern, path)) continue;
    const length = rule.pattern.length;
    if (!best || length > best.length || (length === best.length && rule.allow)) best = { allow: rule.allow, length };
  }
  return best ? best.allow : true;
}

/**
 * The crawlers that matter for being found and cited, by what blocking them costs.
 * Sources (checked 20 Nov 2026): developers.google.com crawler docs (Googlebot feeds Search, AI
 * Overviews and AI Mode; Google-Extended governs Gemini training and grounding in Gemini apps),
 * developers.openai.com/api/docs/bots (OAI-SearchBot is ChatGPT search; GPTBot is training only;
 * ChatGPT-User acts for a user and may not follow robots.txt), support.claude.com/articles/8896518
 * (Claude-SearchBot is search, Claude-User fetches for a user, ClaudeBot is training).
 */
export const CRAWLERS = [
  { agent: "Googlebot", tier: "search", serves: "Google Search, AI Overviews and Gemini" },
  { agent: "Bingbot", tier: "search", serves: "Bing, Copilot and ChatGPT search results" },
  { agent: "OAI-SearchBot", tier: "ai_search", serves: "ChatGPT search" },
  { agent: "PerplexityBot", tier: "ai_search", serves: "Perplexity" },
  { agent: "Claude-SearchBot", tier: "ai_search", serves: "Claude search" },
  { agent: "Google-Extended", tier: "ai_search", serves: "answers in the Gemini app" },
  { agent: "Claude-User", tier: "user_fetch", serves: "pages Claude opens for a user" },
  { agent: "Perplexity-User", tier: "user_fetch", serves: "pages Perplexity opens for a user" },
  { agent: "GPTBot", tier: "training", serves: "OpenAI model training" },
  { agent: "ClaudeBot", tier: "training", serves: "Anthropic model training" },
  { agent: "CCBot", tier: "training", serves: "Common Crawl, used for model training" },
] as const;
export type CrawlerTier = (typeof CRAWLERS)[number]["tier"];

export interface CrawlerAccess {
  /** Crawlers refused at one or more of the checked paths, with those paths. */
  blocked: { agent: string; tier: CrawlerTier; serves: string; paths: string[] }[];
  /** The paths checked: the homepage and the money pages. */
  paths: string[];
  /** False when the site has no robots.txt (or an unreadable one): nothing is blocked by it. */
  hasRobots: boolean;
}

/**
 * Reads a robots.txt response. `status` and `text` come from the fetch; `null` means the file could
 * not be fetched at all (the check is then "not checked"). A 4xx means no robots.txt, so no rules,
 * as crawlers treat it. A 5xx is treated as unknown, because crawlers back off on it.
 */
export function crawlerAccess(robots: { status: number; text: string } | null, paths: string[]): CrawlerAccess | null {
  if (!robots || robots.status >= 500) return null;
  const usable = robots.status === 200 && !/<html|<!doctype/i.test(robots.text.slice(0, 500));
  const checked = [...new Set(paths.length ? paths : ["/"])].slice(0, 6);
  if (!usable) return { blocked: [], paths: checked, hasRobots: false };
  const groups = parseRobots(robots.text);
  const blocked = CRAWLERS.map((c) => ({ agent: c.agent, tier: c.tier, serves: c.serves, paths: checked.filter((p) => !isAllowed(groups, c.agent, p)) })).filter((c) => c.paths.length > 0);
  return { blocked, paths: checked, hasRobots: true };
}

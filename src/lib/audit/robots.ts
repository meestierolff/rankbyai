/**
 * robots.txt, read the way search crawlers read it (RFC 9309), to answer one question for the
 * audit: can the crawlers behind search and AI answers fetch this site's pages?
 *
 * Only what robots.txt says is checked. A firewall or bot-protection rule that refuses a crawler
 * at the network level is invisible from here, and the audit says so.
 */

export interface RobotsRule {
  allow: boolean;
  pattern: string;
  /** 0-based line of the rule in the file, for quoting it. */
  line?: number;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  /** 0-based lines of the group's User-agent lines. */
  agentLines?: number[];
}

/** Parses robots.txt into groups. Unknown lines (Sitemap, Crawl-delay, Host, comments) are ignored. */
export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const [n, raw] of text.split(/\r\n|\r|\n/).entries()) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      // Consecutive User-agent lines share one group; a User-agent after rules starts a new one.
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], agentLines: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      current.agentLines?.push(n);
      lastWasAgent = true;
    } else if (field === "allow" || field === "disallow") {
      lastWasAgent = false;
      // An empty Disallow allows everything: it adds no rule.
      if (current && value) current.rules.push({ allow: field === "allow", pattern: value, line: n });
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
  return decide(groups, agent, path)?.rule.allow ?? true;
}

/** The rule that decides whether `agent` may fetch `path`, the group it is in, and whether that group names the agent. Null: no rule matches (allowed). */
export function decide(groups: RobotsGroup[], agent: string, path: string): { rule: RobotsRule; group: RobotsGroup; named: boolean } | null {
  const token = agent.toLowerCase();
  const named = groups.filter((g) => g.agents.includes(token));
  const applicable = named.length ? named : groups.filter((g) => g.agents.includes("*"));
  let best: { rule: RobotsRule; group: RobotsGroup } | null = null;
  for (const group of applicable) {
    for (const rule of group.rules) {
      if (!patternMatches(rule.pattern, path)) continue;
      const length = rule.pattern.length;
      const bestLength = best?.rule.pattern.length ?? -1;
      if (!best || length > bestLength || (length === bestLength && rule.allow)) best = { rule, group };
    }
  }
  return best ? { ...best, named: named.length > 0 } : null;
}

/**
 * Cloudflare's managed robots.txt: Cloudflare prepends its own block to the site's file while
 * "Enable Bot Preference Sync" is on, between these two comment lines (developers.cloudflare.com/bots/
 * additional-configurations/managed-robots-txt, read 21 Nov 2026, page dated 2 Nov 2026).
 * Returns the 0-based first and last line of that block.
 */
export function cloudflareManagedRange(text: string): [number, number] | null {
  const lines = text.split(/\r\n|\r|\n/);
  const start = lines.findIndex((l) => /^\s*#\s*BEGIN Cloudflare Managed content/i.test(l));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^\s*#\s*END Cloudflare Managed content/i.test(l));
  return [start, end < 0 ? lines.length - 1 : end];
}

/** Why robots.txt blocks a crawler at a path, with the lines that do it, quoted from the file. */
export interface RobotsCause {
  kind: "cloudflare_managed" | "named_group" | "default_deny" | "wildcard";
  /** The group's User-agent lines and the deciding rule, as written in the file. */
  stanza: string;
  path: string;
  /** default_deny: the crawlers the file still lets in, by name. */
  allowedOnly?: string[];
}

export function robotsCause(text: string, groups: RobotsGroup[], agent: string, path: string): RobotsCause | null {
  const d = decide(groups, agent, path);
  if (!d || d.rule.allow) return null;
  const lines = text.split(/\r\n|\r|\n/);
  const quote = (n: number | undefined) => (n == null ? null : (lines[n] ?? "").trim());
  const stanza = [...(d.group.agentLines ?? []).map(quote), quote(d.rule.line)].filter((l): l is string => !!l).join("\n");
  const managed = cloudflareManagedRange(text);
  if (managed && d.rule.line != null && d.rule.line >= managed[0] && d.rule.line <= managed[1]) return { kind: "cloudflare_managed", stanza, path };
  if (d.named) return { kind: "named_group", stanza, path };
  if (d.rule.pattern === "/") {
    const allowedOnly = groups.filter((g) => !g.agents.includes("*") && g.agents.some((a) => isAllowed(groups, a, path))).flatMap((g) => g.agents.filter((a) => isAllowed(groups, a, path)));
    return { kind: "default_deny", stanza, path, allowedOnly: [...new Set(allowedOnly)] };
  }
  return { kind: "wildcard", stanza, path };
}

/**
 * The crawlers that matter for being found and cited, by what blocking them costs.
 *
 * Read on 20 Nov 2026:
 *  - developers.google.com/search/docs/crawling-indexing/google-common-crawlers: Googlebot serves
 *    "Google Search (including Discover and all Google Search features)". Google-Extended controls
 *    use for training Gemini models AND for grounding in Gemini Apps and Grounding with Google Search
 *    on Vertex AI; it "does not impact a site's inclusion in Google Search nor is it used as a
 *    ranking signal". So it is its own tier: blocking it is a common, deliberate training opt-out
 *    (Cloudflare's managed robots.txt blocks it when Training is set to Disallow), with a real cost.
 *  - developers.openai.com/api/docs/bots: OAI-SearchBot is ChatGPT search; GPTBot is training only;
 *    ChatGPT-User acts for a user and robots.txt may not apply to it (so it is not checked).
 *  - support.claude.com/en/articles/8896518 (as summarised by Search Engine Land): Claude-SearchBot
 *    indexes for Claude's search, Claude-User fetches for a user, ClaudeBot is training.
 * Bingbot's index also feeds Microsoft Copilot (Bing Webmaster Tools reports Copilot citations).
 */
export const CRAWLERS = [
  { agent: "Googlebot", tier: "search", serves: "Google Search and its AI features" },
  { agent: "Bingbot", tier: "search", serves: "Bing and Microsoft Copilot" },
  { agent: "OAI-SearchBot", tier: "ai_search", serves: "ChatGPT search" },
  { agent: "PerplexityBot", tier: "ai_search", serves: "Perplexity" },
  { agent: "Claude-SearchBot", tier: "ai_search", serves: "Claude search" },
  { agent: "Google-Extended", tier: "gemini", serves: "Gemini training and Gemini app answers" },
  { agent: "Claude-User", tier: "user_fetch", serves: "pages Claude opens for a user" },
  { agent: "Perplexity-User", tier: "user_fetch", serves: "pages Perplexity opens for a user" },
  { agent: "GPTBot", tier: "training", serves: "OpenAI model training" },
  { agent: "ClaudeBot", tier: "training", serves: "Anthropic model training" },
  { agent: "CCBot", tier: "training", serves: "Common Crawl, used for model training" },
] as const;
export type CrawlerTier = (typeof CRAWLERS)[number]["tier"];

export interface CrawlerAccess {
  /** Crawlers refused at one or more of the checked paths, with those paths and why (at the first of them). */
  blocked: { agent: string; tier: CrawlerTier; serves: string; paths: string[]; cause: RobotsCause | null }[];
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
  const blocked = CRAWLERS
    .map((c) => ({ agent: c.agent, tier: c.tier, serves: c.serves, paths: checked.filter((p) => !isAllowed(groups, c.agent, p)) }))
    .filter((c) => c.paths.length > 0)
    .map((c) => ({ ...c, cause: robotsCause(robots.text, groups, c.agent, c.paths[0]) }));
  return { blocked, paths: checked, hasRobots: true };
}

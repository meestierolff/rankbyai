import type { CrawlerProbe } from "./crawl";
import { quotedLine, type CrawlerAccess, type CrawlerTier, type RobotsCause } from "./robots";

/**
 * Turns "a crawler is blocked" into something an agency can act on: the evidence, the likely cause
 * with how sure we are, where to look, the steps, and a command to check the fix. Pure.
 *
 * Confidence:
 *  - high: robots.txt says it in so many words (the lines are quoted), including Cloudflare's own
 *    managed block, which carries Cloudflare's marker comments;
 *  - medium: a request that named the crawler was refused and Cloudflare's own response headers say
 *    Cloudflare answered, but which Cloudflare setting did it cannot be seen from outside;
 *  - low: a request that named the crawler was refused by a server or firewall we cannot identify.
 * A request RankbyAI sends comes from RankbyAI's servers, not the crawler owner's, so a server
 * finding never claims more than "requests that name this crawler are refused".
 *
 * Cloudflare names below are only those in Cloudflare's documentation, read on 21 Nov 2026:
 *  - developers.cloudflare.com/bots/additional-configurations/block-ai-bots (dated 2 Nov 2026):
 *    Security > Settings, filter by "Bot traffic", "AI Crawler and Agent access policies"; Search,
 *    Agent and Training policies ("Block", "Block on pages with ads", "Allow (do not block)",
 *    Training also "Disallow"); a policy applies to verified bots and matching unverified bots.
 *  - .../bots/additional-configurations/managed-robots-txt (dated 2 Nov 2026): the managed block is
 *    prepended while "Enable Bot Preference Sync" is on; Training "Disallow" adds its directives.
 *  - .../bots/get-started/bot-fight-mode (dated 3 Aug 2026): "Bot fight mode" under the same settings
 *    filter; it issues challenges and cannot be skipped with WAF custom rules or Page Rules.
 *  - .../cloudflare-challenges/challenge-types/challenge-pages/detect-response: every challenge page
 *    response carries the header cf-mitigated: challenge.
 *  - .../support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1020: a 403 from a
 *    security rule with a Block action; the Security Events log, searched by Ray ID, names the rule.
 */

export type CrawlerPurpose = "search" | "training" | "user_fetch";
export type Confidence = "high" | "medium" | "low";

export interface CrawlerDetail {
  agent: string;
  /** search: should usually be allowed to be recommended; training: the business may choose to block it. */
  purpose: CrawlerPurpose;
  serves: string;
  blocked_by: "robots_txt" | "server";
  /** Quoted robots.txt lines, or the status and headers of the refused request. */
  evidence: string;
  cause: string;
  confidence: Confidence;
  /** When the exact setting cannot be seen: the places to look, most likely first. */
  where_to_look: string[];
  steps: string[];
  /** A command to check the fix from any terminal. */
  verify: string;
  /** What this check cannot see. */
  caveat: string | null;
}

/** Crawlers whose server response is tested: AI search first (they decide answers), then two training crawlers for contrast. */
export const PROBE_AGENTS = ["OAI-SearchBot", "PerplexityBot", "Claude-SearchBot", "GPTBot", "ClaudeBot"] as const;
/** A quick (prospect) audit tests the AI search crawlers only. */
export const PROBE_AGENTS_QUICK = PROBE_AGENTS.slice(0, 3);
/**
 * The control: a request of exactly the same shape as the probes that names no crawler. If the
 * server refuses it too, a refusal is about the request's shape (or RankbyAI's servers), not about
 * a crawler's name, and the check says it could not tell.
 */
export const CONTROL_AGENT = "RankbyAI-Control";

const CF_SETTINGS = "Security → Settings in Cloudflare, filtered by “Bot traffic”";
const AI_POLICIES = `“AI Crawler and Agent access policies” (${CF_SETTINGS})`;
const BOT_FIGHT = `“Bot fight mode” (${CF_SETTINGS})`;
const SECURITY_EVENTS = "the Security Events log in Cloudflare, searched by the Ray ID";

export const purposeOf = (tier: CrawlerTier): CrawlerPurpose => (tier === "search" || tier === "ai_search" ? "search" : tier === "user_fetch" ? "user_fetch" : "training");

const PROBE_CAVEAT = "RankbyAI sent this request from its own servers with a user agent that names the crawler. The real crawler comes from its owner's addresses and a firewall can treat it differently, so confirm in the firewall's log.";

/**
 * The site's origin for a command the user (or their assistant) will paste into a terminal. The host
 * comes from a Google listing or a user, so only plain host names (letters, digits, dots, hyphens)
 * and a numeric port pass; anything else gets no command at all. The URL is single-quoted.
 */
export function shellOrigin(origin: string): string | null {
  try {
    const u = new URL(origin);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !/^[a-z0-9.-]+$/i.test(u.hostname) || (u.port && !/^\d{1,5}$/.test(u.port))) return null;
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}`;
  } catch {
    return null;
  }
}

/** The robots.txt rule that blocks a crawler, as advice. */
export function robotsDetail(b: CrawlerAccess["blocked"][number], origin: string): CrawlerDetail {
  const purpose = purposeOf(b.tier);
  const c: RobotsCause | null = b.cause;
  const path = quotedLine(c?.path ?? b.paths[0]);
  const safe = shellOrigin(origin);
  const verify = safe ? `curl -s '${safe}/robots.txt'` : "Open /robots.txt on the site in a browser and read the group for this crawler.";
  const base = { agent: b.agent, purpose, serves: b.serves, blocked_by: "robots_txt" as const, evidence: c?.stanza ?? `Disallow covers ${path}`, confidence: "high" as const, where_to_look: [], verify, caveat: null };
  const training = purpose === "training";
  const keepTraining = b.tier === "gemini"
    ? "Google-Extended also feeds answers in the Gemini app: allow it if those answers matter more to the business than staying out of training."
    : "Nothing to change if the business does not want its content used for AI training: this crawler does not decide search answers.";

  if (c?.kind === "cloudflare_managed") {
    return {
      ...base,
      cause: training
        ? "Cloudflare adds this rule: its managed robots.txt is on and the Training policy is set to Disallow."
        : "Cloudflare adds this rule: its managed robots.txt is on and the policy for the category Cloudflare puts this crawler in (Search or Agent) is set to Block or Block on pages with ads.",
      steps: training
        ? [keepTraining, `To change it, open ${AI_POLICIES} and set Training to “Allow (do not block)”.`]
        : [
            `Open ${AI_POLICIES}.`,
            "Set Search (and Agent, for assistants that open pages for a user) to “Allow (do not block)”. Training can stay on Disallow.",
            "Editing robots.txt on the server will not remove these lines: Cloudflare adds them while “Enable Bot Preference Sync” is on.",
          ],
    };
  }
  if (c?.kind === "default_deny") {
    const only = c.allowedOnly?.length ? c.allowedOnly.join(", ") : "no named crawler";
    return {
      ...base,
      cause: `robots.txt blocks every crawler by default (User-agent: * with Disallow: /) and only lets in ${only}. That hides the site from Bing, which also feeds ChatGPT search and Copilot, and from AI search crawlers.`,
      steps: training ? [keepTraining] : [
        "Change the User-agent: * group to Allow: / and disallow only private paths (for example /admin/ or /cart/).",
        "Keep separate groups only for crawlers the business wants out, such as training crawlers (GPTBot, ClaudeBot, CCBot).",
        "If a CMS or SEO plugin writes robots.txt, change it there, or it will write the old file again.",
      ],
    };
  }
  if (c?.kind === "named_group") {
    return {
      ...base,
      cause: `robots.txt has its own group for ${b.agent} that disallows ${path}.`,
      steps: training ? [keepTraining] : [
        `In robots.txt, delete the Disallow line quoted in the evidence from the User-agent: ${b.agent} group, or change it to Allow: /.`,
        "If a CMS or SEO plugin writes robots.txt, change it there, or it will write the old file again.",
      ],
    };
  }
  return {
    ...base,
    cause: `The rules for all crawlers (User-agent: *) disallow ${path}, and robots.txt has no group of its own for ${b.agent}.`,
    steps: training ? [keepTraining] : [
      `Narrow or remove the Disallow line quoted in the evidence (in the User-agent: * group) so ${path} is allowed, or give ${b.agent} its own group with Allow: /.`,
      "If a CMS or SEO plugin writes robots.txt, change it there, or it will write the old file again.",
    ],
  };
}

const viaCloudflare = (p: CrawlerProbe) => !!p.cfRay || /cloudflare/i.test(p.server ?? "");

/** The status line of a probe, as evidence. */
export function probeEvidence(p: CrawlerProbe): string {
  if (p.status == null) return "no answer within 5 seconds";
  const parts = [`HTTP ${p.status}`];
  if (p.cfMitigated) parts.push(`cf-mitigated: ${p.cfMitigated}`);
  if (p.server) parts.push(`server: ${p.server}`);
  if (p.cfRay) parts.push(`cf-ray: ${p.cfRay}`);
  return parts.join(", ");
}

/**
 * A refused probe as advice, or null when the server let the request in (or did not answer, which
 * says nothing about a block). Only call it when RankbyAI's own request to the homepage succeeded:
 * otherwise a refusal cannot be put down to the crawler's name.
 */
export function probeDetail(p: CrawlerProbe, tier: CrawlerTier, serves: string, origin: string): CrawlerDetail | null {
  if (p.status == null || p.status < 400) return null;
  const purpose = purposeOf(tier);
  const safe = shellOrigin(origin);
  // p.agent is one of PROBE_AGENTS (our own constant); the site's host only passes as a plain host name.
  const verify = safe ? `curl -s -o /dev/null -w "%{http_code}\\n" -A "${p.agent}" '${safe}/'` : "Ask whoever runs the site's firewall to check its log for requests that name this crawler.";
  const snippet = p.snippet ? ` Page text (quoted from the site): “${quotedLine(p.snippet).slice(0, 160)}”` : "";
  const base = { agent: p.agent, purpose, serves, blocked_by: "server" as const, evidence: `${probeEvidence(p)}.${snippet}`, verify, caveat: PROBE_CAVEAT };
  const training = purpose === "training";
  const trainingStep = "Nothing to change if the business does not want its content used for AI training: this crawler does not decide search answers.";

  if (viaCloudflare(p) && p.cfMitigated === "challenge") {
    return {
      ...base,
      cause: "Cloudflare answered with a challenge page instead of the homepage. Crawlers do not solve challenges, so they get no content.",
      confidence: "medium",
      where_to_look: [
        `${BOT_FIGHT}: it challenges traffic that looks like a bot, and Cloudflare says it cannot be skipped with WAF custom rules.`,
        `${AI_POLICIES}: the Search or Agent policy.`,
        "WAF custom rules with a challenge action.",
      ],
      steps: training ? [trainingStep] : [
        `Find which feature challenged the request in ${SECURITY_EVENTS}.`,
        "Bot fight mode: it cannot make exceptions; Cloudflare's own advice is Super Bot Fight Mode, which can skip rules, or turning it off.",
        "AI Crawler and Agent access policy: set Search to “Allow (do not block)”.",
        "A custom rule: exclude AI search crawlers from it.",
      ],
    };
  }
  if (viaCloudflare(p)) {
    const e1020 = /\b1020\b/.test(p.snippet);
    return {
      ...base,
      cause: e1020
        ? "Cloudflare refused the request with error 1020: a security rule with a Block action matched it."
        : "Cloudflare refused the request: a security rule or bot setting blocked it.",
      confidence: "medium",
      where_to_look: [`${AI_POLICIES}: the Search or Agent policy set to Block.`, "WAF custom rules that match user agents.", `${SECURITY_EVENTS}.`],
      steps: training ? [trainingStep] : [
        `Find the rule that blocked it in ${SECURITY_EVENTS}.`,
        "AI Crawler and Agent access policy: set Search to “Allow (do not block)”.",
        "A custom rule that matches user agents: exclude AI search crawlers from it.",
      ],
    };
  }
  return {
    ...base,
    cause: "The server, or a firewall in front of it, refused a request that named this crawler while it served RankbyAI's normal request.",
    confidence: "low",
    where_to_look: ["The hosting provider's firewall or bot protection.", "A security plugin, or server rules (such as .htaccess) that block user agents.", "A CDN or proxy in front of the site."],
    steps: training ? [trainingStep] : ["Find the rule that matches this crawler's name and let AI search crawlers through.", "Then run the command below again: it should print a 200."],
  };
}

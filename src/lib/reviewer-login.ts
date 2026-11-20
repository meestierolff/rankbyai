import "server-only";
import { hashIdentifier } from "@/lib/crypto";
import { dbAdmin } from "@/lib/db/clients";
import { clientIp } from "@/lib/request";

/**
 * Password sign-in for app-directory reviewers (OpenAI, Anthropic, xAI), and for nobody else.
 *
 * Customers sign in with Google. Directory reviews need a test account that signs in without
 * Google, codes or magic links, so each address listed in REVIEWER_LOGIN_EMAILS may sign in with
 * a password at /login/reviewer. The list empty or unset means off: the page and password sign-in
 * answer 404.
 *
 * Three locks keep passwords to those accounts:
 * - Neon Auth has email and password switched on with sign-up OFF, so no visitor can create a
 *   password account; the reviewer accounts are made by hand (docs/SETUP.md).
 * - gateAuthRequest (in the /api/auth proxy) refuses password sign-in for any address that is
 *   not listed, and always refuses password sign-up and password resets.
 * - Password attempts are rate limited per IP address.
 */
export const REVIEWER_LOGIN_PATH = "/login/reviewer";

const MAX_EMAIL = 254;
const EXACT_ADDRESS = /^[^\s@,;*]+@[^\s@,;*]+\.[^\s@,;*]+$/;

/** Exact addresses from a comma-separated list, lower-cased. Anything else (a wildcard, a bare
 * domain, two addresses joined by a semicolon) is ignored, so a typo can only switch it off. */
export function parseReviewerEmails(value: string | undefined): ReadonlySet<string> {
  const out = new Set<string>();
  for (const entry of (value ?? "").split(",")) {
    const email = entry.trim().toLowerCase();
    if (email.length <= MAX_EMAIL && EXACT_ADDRESS.test(email)) out.add(email);
  }
  return out;
}

export const reviewerEmails = (): ReadonlySet<string> => parseReviewerEmails(process.env.REVIEWER_LOGIN_EMAILS);
export const reviewerLoginOn = (): boolean => reviewerEmails().size > 0;

/** Better Auth endpoints that create or reset a password. Never reachable through this site. */
const PASSWORD_WRITES = new Set(["sign-up/email", "forget-password", "request-password-reset", "reset-password", "set-password"]);

/** Attempts per IP address per window, counted before the list is read. */
export const REVIEWER_ATTEMPTS = { windowSeconds: 900, limit: 10 } as const;
/** A refusal from this gate takes at least this long, so its speed does not reveal the list. */
export const REFUSAL_FLOOR_MS = 700;

const json = (status: number, code: string, message: string) => Response.json({ code, message }, { status });
const notFound = () => json(404, "NOT_FOUND", "Not found");

export interface GateDeps {
  emails: () => ReadonlySet<string>;
  /** true = allowed, false = over the limit; throws when the limiter cannot be reached. */
  hit: (key: string) => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export const gateDeps: GateDeps = {
  emails: reviewerEmails,
  hit: async (key) => {
    const { data, error } = await dbAdmin().rpc("rate_limit_hit", { p_key: key, p_window_seconds: REVIEWER_ATTEMPTS.windowSeconds, p_limit: REVIEWER_ATTEMPTS.limit });
    if (error) throw new Error(`rate limit lookup failed (${error.code ?? "unknown"})`);
    return data === true;
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: Date.now,
};

/**
 * Runs before every /api/auth request reaches Neon Auth. Returns a response to send instead, or
 * null to let the request through. Google sign-in, sessions and sign-out are never touched.
 */
export async function gateAuthRequest(method: string, path: readonly string[], request: Request, deps: GateDeps = gateDeps): Promise<Response | null> {
  const route = path.join("/");
  if (PASSWORD_WRITES.has(route)) return notFound();
  if (route !== "sign-in/email") return null;
  if (method !== "POST") return notFound();

  const emails = deps.emails();
  if (emails.size === 0) return notFound();

  const startedAt = deps.now();
  const refuse = async () => {
    const wait = REFUSAL_FLOOR_MS - (deps.now() - startedAt);
    if (wait > 0) await deps.sleep(wait);
    // The same answer Better Auth gives for a wrong password, so a refusal does not tell a guesser
    // whether the address is on the list.
    return json(401, "INVALID_EMAIL_OR_PASSWORD", "Invalid email or password");
  };

  try {
    if (!(await deps.hit(`reviewer-login:${hashIdentifier(clientIp(request.headers))}`))) {
      return json(429, "TOO_MANY_REQUESTS", "Too many attempts. Try again in 15 minutes.");
    }
  } catch {
    return json(503, "UNAVAILABLE", "Sign-in is unavailable right now. Try again in a minute.");
  }

  let email = "";
  try {
    const body = (await request.clone().json()) as { email?: unknown };
    if (typeof body?.email === "string" && body.email.length <= MAX_EMAIL) email = body.email.trim().toLowerCase();
  } catch {
    // not JSON: refused below like any other unknown address
  }
  if (!email || !emails.has(email)) return refuse();
  return null;
}

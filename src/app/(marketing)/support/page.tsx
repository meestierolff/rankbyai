import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/marketing/page-shell";
import { publicEnv } from "@/lib/env-public";
import { oauthOpen } from "@/lib/oauth/config";
import { REFUND_DAYS } from "@/lib/pricing-constants";

const SUPPORT_EMAIL = "mees@rankbyai.live";

export const metadata: Metadata = {
  title: "Support",
  description: "How to get help with RankbyAI: email support, connecting Claude, ChatGPT or Cursor over MCP, API keys, refunds, and your data.",
  alternates: { canonical: "/support" },
};

/** Public support page (a support URL is required by the ChatGPT and Claude app directories). */
export default function SupportPage() {
  const mcp = `${publicEnv.siteUrl}/api/mcp`;
  return (
    <ProsePage eyebrow="Help" title="Support" updated="20 November 2026" intro="Questions, problems, refunds and data requests all go to one address, and a person answers.">
      <h2>Contact</h2>
      <p>
        Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Tell us the email address you sign in with and, for a scan, audit or report, its link.
        That is all we need to find it. Never send API keys or passwords by email.
      </p>

      <h2>Connect Claude, ChatGPT, Cursor or another MCP client</h2>
      {oauthOpen() ? (
        <>
          <p>
            Add RankbyAI as a custom connector or MCP server with this URL: <code>{mcp}</code> (Streamable HTTP). The client opens a RankbyAI sign-in: sign in
            with your Google account and allow the app. It then works in your workspace only, and only the workspace owner can connect apps.
          </p>
          <p>
            Clients without sign-in support can use an API key instead, sent as <code>Authorization: Bearer rbai_live_…</code>. Create keys, see connected apps
            and disconnect them under <strong>API &amp; MCP</strong> in the app. The <Link href="/docs/api">API and MCP documentation</Link> lists every tool.
          </p>
        </>
      ) : (
        <p>
          Add RankbyAI as an MCP server with this URL: <code>{mcp}</code> (Streamable HTTP), and send an API key as{" "}
          <code>Authorization: Bearer rbai_live_…</code>. Create and revoke keys under <strong>API &amp; MCP</strong> in the app. The{" "}
          <Link href="/docs/api">API and MCP documentation</Link> lists every tool.
        </p>
      )}
      <p>
        If a client suddenly answers &ldquo;unauthorized&rdquo;, its key was revoked or its connection ended: add it again.
        Every tool that costs money returns an estimate first and runs only after you confirm.
      </p>

      <h2>Billing and refunds</h2>
      <p>
        Lifetime access is a one-time payment, with a {REFUND_DAYS}-day refund. See the <Link href="/refunds">refund policy</Link>. Scans on your own API keys are
        billed by those vendors, not by us.
      </p>

      <h2>Your data</h2>
      <p>
        The <Link href="/privacy">privacy policy</Link> says what we store and who processes it. If your business appears on one of our public pages and you want it
        removed or corrected, use the <Link href="/removal">removal request</Link> form. What results mean, and what they do not, is in the{" "}
        <Link href="/disclaimer">disclaimer</Link>.
      </p>

      <h2>Security</h2>
      <p>
        Found a security problem? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with &ldquo;Security&rdquo; in the subject. Please give us a chance to fix
        it before you publish details.
      </p>
    </ProsePage>
  );
}

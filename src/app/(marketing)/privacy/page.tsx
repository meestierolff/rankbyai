import type { Metadata } from "next";
import Link from "next/link";
import { LegalAddress, LegalEmail, LegalEntity, LegalKvk } from "@/components/legal-identity";
import { ProsePage } from "@/components/marketing/page-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What personal data RankbyAI collects, why, which companies process it for us, how cookies and consent work, how long we keep data and how to use your GDPR rights.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <ProsePage
      eyebrow="Legal"
      title="Privacy Policy"
      updated="18 November 2026"
      intro="This page says what personal data RankbyAI collects, why we collect it, who handles it for us and what your rights are under the EU General Data Protection Regulation (GDPR)."
    >
      <h2>1. Who is responsible</h2>
      <p>
        The data controller is <LegalEntity />
        <LegalKvk />, <LegalAddress />. That is the operator of RankbyAI (rankbyai.live), based in the Netherlands. For any privacy question or request, email <LegalEmail />.
      </p>

      <h2>2. What we collect</h2>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>What it is</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Account</td>
            <td>Your name, email address and profile picture, as Google shares them when you sign in with your Google account. We store no password.</td>
          </tr>
          <tr>
            <td>Workspace</td>
            <td>Workspace name, team members, client names and notes, and your report branding: brand name, logo, color, website and reply-to email.</td>
          </tr>
          <tr>
            <td>Businesses</td>
            <td>
              The businesses you add or look up: name, address, phone, website, category, rating, review count and map listing IDs. This is business listing information. For a sole proprietor
              it can also be personal data.
            </td>
          </tr>
          <tr>
            <td>Scans and reports</td>
            <td>Keywords and prompts, grid points, map ranks, AI answers with the businesses and sources they name, audits, fix kits and reports.</td>
          </tr>
          <tr>
            <td>Vendor API keys</td>
            <td>
              The keys you save for DataForSEO, OpenAI, Perplexity and Gemini. They are encrypted with AES-256-GCM and are write-only: a saved key is never shown again. We keep a short hint, such
              as the last four characters or the login email, so that you can recognize the key.
            </td>
          </tr>
          <tr>
            <td>RankbyAI API keys</td>
            <td>Keys you create for our API. We store a hash and a short prefix, not the key itself.</td>
          </tr>
          <tr>
            <td>Usage and cost</td>
            <td>Which scans ran, their estimated and actual cost, and your credit balance.</td>
          </tr>
          <tr>
            <td>Billing</td>
            <td>
              Stripe handles the payment. Stripe collects your card details, billing address and tax ID if you give one. We keep an order record: email, product, amount, currency, status and
              Stripe reference IDs. We never see or store your full card number.
            </td>
          </tr>
          <tr>
            <td>Free check</td>
            <td>The business name and city you enter. To enforce the limits we store a hash of the email address of the Google account you sign in with and a hash of the IP address.</td>
          </tr>
          <tr>
            <td>Removal requests</td>
            <td>The business name, page address, your email address and your reason.</td>
          </tr>
          <tr>
            <td>Security logs</td>
            <td>Short-lived technical logs such as IP address, request counts and bot-check results. We use them to stop abuse and to fix errors.</td>
          </tr>
          <tr>
            <td>Analytics</td>
            <td>Page views and product events, such as starting a checkout. See section 6.</td>
          </tr>
        </tbody>
      </table>
      <p>We do not collect email addresses of the businesses you scan, and we do not send email to them.</p>

      <h2>3. Why we use it</h2>
      <ul>
        <li>
          <strong>To provide the service you asked for</strong> (contract): your account, workspace, scans, reports, payments, refunds and service emails such as receipts.
        </li>
        <li>
          <strong>To meet legal duties</strong> (legal obligation): keeping payment and tax records.
        </li>
        <li>
          <strong>To keep the service safe and working</strong> (legitimate interest): security logs, abuse limits, error fixing and counting visits without cookies.
        </li>
        <li>
          <strong>To show which businesses AI assistants name</strong> (legitimate interest): scan results and the public pages described in section 4.
        </li>
        <li>
          <strong>With your consent</strong>: the analytics cookie, where we ask for it. You can withdraw consent at any time.
        </li>
      </ul>

      <h2>4. Businesses in scans, share links and public pages</h2>
      <p>RankbyAI measures which local businesses AI assistants and Google Maps show. So businesses that never signed up can appear in results.</p>
      <ul>
        <li>
          <strong>Scans.</strong> A scan stores the businesses that were named or ranked, as returned by the APIs.
        </li>
        <li>
          <strong>Share links.</strong> A report link is unlisted and hard to guess. The page asks search engines not to index it. The workspace owner can revoke it.
        </li>
        <li>
          <strong>Public regional pages.</strong> These pages show which businesses AI assistants named for a service in a place. They are built from combined scan samples: scans we run on our own
          keys, and scans from workspaces only if that workspace has opted in. They never show which workspace a scan came from.
        </li>
      </ul>
      <p>
        If your business appears on a public page and you want it removed or corrected, use the <Link href="/removal">removal request</Link> form. We handle requests within 7 days.
      </p>

      <h2>5. Who processes data for us</h2>
      <p>We use these companies to run RankbyAI.</p>
      <table>
        <thead>
          <tr>
            <th>Company</th>
            <th>What it does for us</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Neon</td>
            <td>Database, sign-in sessions and file storage.</td>
          </tr>
          <tr>
            <td>Google</td>
            <td>Sign-in with your Google account. Google tells us your name, email address and profile picture.</td>
          </tr>
          <tr>
            <td>Vercel</td>
            <td>Hosting of the site and the app, and Web Analytics (counts of page views, without cookies). See section 6.</td>
          </tr>
          <tr>
            <td>Stripe</td>
            <td>Payments, tax calculation, invoices and refunds.</td>
          </tr>
          <tr>
            <td>Resend</td>
            <td>Sending email, such as receipts.</td>
          </tr>
          <tr>
            <td>DataForSEO</td>
            <td>Google Maps results and business listing data. Gets the keyword and location of a scan.</td>
          </tr>
          <tr>
            <td>OpenAI</td>
            <td>AI answers. Gets the prompt and location of a scan. Also gets AI answer text and business listing data when we parse results or build a Fix Kit.</td>
          </tr>
          <tr>
            <td>Perplexity</td>
            <td>AI answers. Gets the prompt and location of a scan.</td>
          </tr>
          <tr>
            <td>Google</td>
            <td>AI answers through the Gemini API. Gets the prompt and location of a scan.</td>
          </tr>
          <tr>
            <td>PostHog</td>
            <td>Product analytics, on PostHog&rsquo;s EU cloud. See section 6.</td>
          </tr>
          <tr>
            <td>Cloudflare Turnstile</td>
            <td>A bot check on sign-up, the free check and the removal form.</td>
          </tr>
          <tr>
            <td>Ship or Die tracker</td>
            <td>A third-party script that measures traffic for the Ship or Die hackathon, which RankbyAI takes part in. See section 6.</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>Your own keys.</strong> When a scan runs on your own API keys, the request goes to DataForSEO, OpenAI, Perplexity or Google under your account with that vendor. That vendor&rsquo;s
        own terms and privacy policy apply to it.
      </p>
      <p>
        <strong>Outside Europe.</strong> Some of these companies are based outside the European Economic Area, including in the United States. Email us if you want to know more about how a
        specific company handles your data.
      </p>
      <p>We also share data when the law requires it, for example with the tax authority.</p>

      <h2>6. Cookies and consent</h2>
      <h3>Needed to work</h3>
      <ul>
        <li>A sign-in cookie that keeps you logged in.</li>
        <li>Cloudflare Turnstile may store data in your browser to tell people from bots.</li>
        <li>Stripe sets its own cookies on its checkout page.</li>
      </ul>
      <p>These do not need consent.</p>
      <h3>Analytics (PostHog, EU cloud)</h3>
      <ul>
        <li>
          <strong>Visitors in the EU, EEA, United Kingdom and Switzerland.</strong> We tell by your browser&rsquo;s time zone and language. You are asked first. Until you answer, we count visits
          without cookies and store nothing on your device for analytics. If you choose <strong>Allow</strong>, PostHog sets an analytics cookie and uses local storage. If you choose{" "}
          <strong>No thanks</strong>, analytics is turned off for you.
        </li>
        <li>
          <strong>Visitors elsewhere.</strong> PostHog uses an analytics cookie and local storage from your first visit.
        </li>
        <li>We do not record sessions, and we do not capture clicks or typing automatically.</li>
        <li>Your choice is saved in your browser&rsquo;s local storage. To change it, clear the site data for rankbyai.live and you will be asked again.</li>
      </ul>
      <h3>Vercel Web Analytics</h3>
      <p>
        Vercel Web Analytics counts page views, which pages are visited and where visits come from (the referring site, country and device type). It sets no cookies and stores nothing on
        your device. According to Vercel, a visitor is told apart by a hash of the request, and visitor sessions are discarded after 24 hours (vercel.com/docs/analytics/privacy-policy). It runs on every page, including report links, and is not
        controlled by the analytics choice above.
      </p>
      <h3>Ship or Die hackathon tracker</h3>
      <p>
        RankbyAI takes part in the Ship or Die hackathon. The hackathon requires its tracker script on every page, to measure traffic to the site. The script is run by the hackathon, not by us.
        It loads on every page and is not controlled by the analytics choice above.
      </p>

      <h2>7. How long we keep data</h2>
      <ul>
        <li>
          <strong>Account, workspace, businesses and scans:</strong> for as long as you have an account. Email us to have them deleted.
        </li>
        <li>
          <strong>After a refund:</strong> your workspace is locked and the data is kept so that you can export it. Email us to have it deleted.
        </li>
        <li>
          <strong>Vendor API keys:</strong> until you replace or delete them, or your account is deleted.
        </li>
        <li>
          <strong>Payment records:</strong> for as long as tax law requires, even after your account is deleted.
        </li>
        <li>
          <strong>Security logs:</strong> a short time only.
        </li>
        <li>
          <strong>Free check hashes:</strong> for as long as we need them to enforce the one-per-account limit.
        </li>
        <li>
          <strong>If we shut down:</strong> you get at least 60 days&rsquo; notice and an export first.
        </li>
      </ul>

      <h2>8. How we protect data</h2>
      <ul>
        <li>Vendor API keys are encrypted with AES-256-GCM, are write-only, and are used only from our servers.</li>
        <li>Database rules limit each workspace to its own data.</li>
        <li>Payments run on Stripe&rsquo;s pages, so card details never reach our servers.</li>
      </ul>
      <p>No system is perfectly secure. If you think something is wrong, email us.</p>

      <h2>9. Your rights</h2>
      <p>Under the GDPR you can ask us to:</p>
      <ul>
        <li>show you the personal data we hold about you;</li>
        <li>correct it;</li>
        <li>delete it;</li>
        <li>limit how we use it, or object to our use of it;</li>
        <li>give it to you in a format you can take elsewhere.</li>
      </ul>
      <p>
        You can also withdraw consent for analytics at any time. To use any of these rights, email <LegalEmail />. We answer within one month, as the GDPR requires. Using your rights is free.
      </p>
      <p>
        If you are not happy with our answer, you can complain to the Dutch data protection authority (Autoriteit Persoonsgegevens) or to the authority in your own country.
      </p>

      <h2>10. Age</h2>
      <p>RankbyAI is for business use by people aged 18 or older. We do not knowingly collect data from children.</p>

      <h2>11. Changes</h2>
      <p>If we change this policy, we post the new version on this page with a new date.</p>

      <h2>12. Contact</h2>
      <p>
        <LegalEntity />, <LegalAddress />. Email: <LegalEmail />. See also the <Link href="/terms">terms of service</Link>, the <Link href="/refunds">refund policy</Link> and the{" "}
        <Link href="/disclaimer">disclaimer</Link>.
      </p>
    </ProsePage>
  );
}

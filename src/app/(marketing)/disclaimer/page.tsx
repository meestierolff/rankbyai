import type { Metadata } from "next";
import Link from "next/link";
import { LegalEmail, LegalEntity } from "@/components/legal-identity";
import { ProsePage } from "@/components/marketing/page-shell";
import { AI_DISCLAIMER_TEXT, NOT_AFFILIATED } from "@/lib/copy";
import { miscEnv } from "@/lib/env";
import { COMPETITOR_PRICES_DATE, ENGINE_LABEL, PRICES_READ_ON } from "@/lib/pricing-constants";

export const metadata: Metadata = {
  title: "Disclaimer",
  description:
    "What RankbyAI results are and are not: AI answers vary, API results can differ from the consumer apps, every result is a sample, and we are not affiliated with the companies we name.",
  alternates: { canonical: "/disclaimer" },
};

export default function DisclaimerPage() {
  const affiliate = Boolean(miscEnv.dataforseoAffiliateUrl());
  return (
    <ProsePage eyebrow="Legal" title="Disclaimer" updated="20 November 2026" intro="Please read this before you rely on a RankbyAI result or show one to a client.">
      <h2>AI answers vary</h2>
      <p>
        <strong>{AI_DISCLAIMER_TEXT}</strong>
      </p>
      <p>Ask an AI assistant the same question twice and you can get two different answers. That is how these systems work. It is not a fault in RankbyAI, and we cannot remove it.</p>

      <h2>API results are not the consumer apps</h2>
      <p>We collect results only through official APIs. We do not scrape Google or the consumer apps of ChatGPT, Perplexity or Gemini.</p>
      <p>When RankbyAI shows a result under one of these names, this is what we asked:</p>
      <table>
        <thead>
          <tr>
            <th>Name in RankbyAI</th>
            <th>What we call</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{ENGINE_LABEL.openai.short}</td>
            <td>{ENGINE_LABEL.openai.api}</td>
          </tr>
          <tr>
            <td>{ENGINE_LABEL.perplexity.short}</td>
            <td>{ENGINE_LABEL.perplexity.api}</td>
          </tr>
          <tr>
            <td>{ENGINE_LABEL.gemini.short}</td>
            <td>{ENGINE_LABEL.gemini.api}</td>
          </tr>
          <tr>
            <td>Google Maps rank</td>
            <td>DataForSEO Google Maps results</td>
          </tr>
        </tbody>
      </table>
      <p>An API can answer differently from the app that a person uses on a phone or laptop. Treat a RankbyAI result as a measurement of the API, taken in a consistent way.</p>

      <h2>Every result is a sample</h2>
      <ul>
        <li>
          <strong>Fixed points.</strong> A scan asks the same prompt at fixed points on a map grid. A person standing somewhere else, or asking in different words, may get a different answer.
        </li>
        <li>
          <strong>Fixed dates.</strong> Each scan shows the date it ran. It says what the API returned then, not what it returns now.
        </li>
        <li>
          <strong>One sample each.</strong> A result is one answer from one engine at one point. A count such as &ldquo;mentioned at 2 of 9 points&rdquo; describes that scan only.
        </li>
      </ul>
      <p>The same applies to Google Maps ranks. They are read at each grid point on the scan date and can differ from what a person sees on their own device.</p>

      <h2>No guarantee of rankings or results</h2>
      <ul>
        <li>We do not rank businesses, and we cannot make an AI assistant or Google recommend anyone.</li>
        <li>We do not guarantee any ranking, AI mention, lead or business result.</li>
        <li>Audit scores and suggested fixes are guidance based on the data we could collect. They are not professional advice, and we do not edit listings or websites.</li>
        <li>You decide what to do with the results, and what you tell your clients about them.</li>
      </ul>

      <h2>Cost estimates</h2>
      <p>
        Data costs shown on this site and in the app are our estimates. They are based on the API vendors&rsquo; published prices, read on {PRICES_READ_ON}. The vendors set those prices and can
        change them. The app shows the actual cost after each scan. When you use your own keys, the vendor&rsquo;s own invoice is what counts.
      </p>

      <h2>Sample data and competitor prices</h2>
      <ul>
        <li>Demo content on this site is labeled &ldquo;Sample data&rdquo;. It does not show real customers or real results.</li>
        <li>
          Competitor prices on this site were taken from those companies&rsquo; public pricing pages on {COMPETITOR_PRICES_DATE} and may have changed. Their plans include features that RankbyAI
          does not have.
        </li>
      </ul>

      <h2>Not affiliated</h2>
      <p>
        <strong>{NOT_AFFILIATED}</strong>
      </p>
      <p>
        The same goes for every other company named on this site, including the tools we compare ourselves with. We name them only to describe what RankbyAI does. Names and trademarks belong to
        their owners.
      </p>
      {affiliate ? (
        <p>
          One disclosure: our sign-up link to DataForSEO is a referral link. If you open an account through it, DataForSEO may pay us a commission. DataForSEO does not endorse RankbyAI.
        </p>
      ) : null}

      <h2>Businesses shown on public pages</h2>
      <p>
        Our public regional pages show which businesses the AI assistants named in a place, based on combined scan samples. They are subject to everything on this page. They are not a rating or a
        review of any business, and they are not our opinion of one.
      </p>
      <p>
        If your business appears and you want it removed or corrected, use the <Link href="/removal">removal request</Link> form. We handle requests within 7 days.
      </p>

      <h2>Hackathon</h2>
      <p>
        RankbyAI takes part in the Ship or Die hackathon. A third-party tracker script from the hackathon measures traffic on the pages of this site, except shared report links. The{" "}
        <Link href="/privacy">privacy policy</Link> has the details.
      </p>

      <h2>Contact</h2>
      <p>
        RankbyAI is operated by <LegalEntity />. Questions about this page? Email <LegalEmail />. See also the <Link href="/terms">terms of service</Link>.
      </p>
    </ProsePage>
  );
}

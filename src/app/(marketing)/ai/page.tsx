import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/marketing/page-shell";
import { AI_DISCLAIMER_TEXT } from "@/lib/copy";

export const metadata: Metadata = {
  title: "AI visibility by city",
  description: "Which local businesses AI assistants recommend, by niche and city, built from aggregated RankbyAI scans.",
  alternates: { canonical: "/ai" },
};

export default function AiIndexPage() {
  return (
    <ProsePage
      eyebrow="Regional data"
      title="AI visibility by city"
      intro="Which businesses do AI assistants recommend for a niche in a city? These pages are built from aggregated scans and published once there is enough data to be useful."
    >
      <h2>No pages yet</h2>
      <p>
        A regional page is published only when it is based on at least 27 AI answers from at least 2 separate scans. No niche and city has reached
        that yet, so there is nothing to list. Pages will appear here as scans accumulate.
      </p>
      <h2>How the data is collected</h2>
      <p>
        Through official APIs only, at fixed map points and dates. {AI_DISCLAIMER_TEXT} Pages never identify the customer whose scan contributed data.
      </p>
      <p>Is your business on a page and you want it removed or corrected? Use the <Link href="/removal">removal request</Link> form.</p>
    </ProsePage>
  );
}

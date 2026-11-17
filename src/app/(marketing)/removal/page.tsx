import type { Metadata } from "next";
import { LegalEmail } from "@/components/legal-identity";
import { ProsePage } from "@/components/marketing/page-shell";
import { miscEnv } from "@/lib/env";
import { RemovalForm } from "./removal-form";

export const metadata: Metadata = {
  title: "Removal or correction request",
  description: "Ask RankbyAI to remove or correct a business on a public regional page. Requests are handled within 7 days.",
  alternates: { canonical: "/removal" },
};

export default function RemovalPage() {
  return (
    <ProsePage
      eyebrow="Legal"
      title="Removal or correction request"
      updated="17 November 2026"
      intro="If a public RankbyAI page mentions your business and you want it removed or corrected, tell us here. No account needed."
    >
      <p>
        Our public regional pages show which businesses AI assistants named for a prompt, at fixed points and dates. They are built from aggregated
        scans and never identify the customer who ran them. We handle every request within 7 days. You can also email <LegalEmail />.
      </p>
      <div className="not-prose mt-8 text-fg"><RemovalForm turnstileSiteKey={miscEnv.turnstileSiteKey()} /></div>
    </ProsePage>
  );
}

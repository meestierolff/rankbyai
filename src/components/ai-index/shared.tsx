import Link from "next/link";
import { IndexCheckLink } from "./check-link";
import { INDEX_PATH, indexPublished } from "@/lib/ai-index/data";

export function Correction() {
  return <section id="corrections"><h2>Can an agency request a correction?</h2><p>If your agency is named here and something is wrong — or you want to ask for a correction or removal — email <a href="mailto:mees@rankbyai.live">mees@rankbyai.live</a> with the city, the name as it appears, and what should change. We aim to handle requests within 7 days. A change on this page does not change what ChatGPT will say on a later run.</p><p>We can edit our record of that run or add a note; we cannot edit ChatGPT’s output.</p></section>;
}
export function IndexCta({ sourcePage = INDEX_PATH }: { sourcePage?: string }) {
  return <section id="free-check"><h2>Want a current check for a specific business?</h2><p>We make RankbyAI.</p><IndexCheckLink sourcePage={sourcePage} /><p className="index-note">The check runs in about a minute and you see who ChatGPT, Perplexity and Gemini name at a business’s address. No account or card needed. This index is a past snapshot; a free check is a new run for one business.</p><p><Link href="/ai-visibility-tracker">How the AI visibility tracker works</Link> · <Link href="/pricing">Pricing</Link></p></section>;
}
export function IndexResearchLink({ label = "SEO Agency AI Index" }: { label?: string }) {
  if (!indexPublished) return null;
  return <p className="container-lp py-6 text-[14px] text-lp-muted">Research and reports: <Link href={INDEX_PATH} className="underline underline-offset-4">{label}</Link></p>;
}

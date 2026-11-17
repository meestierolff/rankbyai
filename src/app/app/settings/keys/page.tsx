import type { Metadata } from "next";
import { ModulePreview } from "@/components/app/module-preview";

export const metadata: Metadata = { title: "API keys" };

export default function Page() {
  return <ModulePreview title="API keys" description="Your DataForSEO, OpenAI, Perplexity and Gemini keys. Encrypted, write-only." ships="Ships in the next milestone." />;
}

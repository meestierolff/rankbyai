"use client";
import { CreamLink } from "@/components/marketing/lp";
import { setIndexCheckSource } from "@/lib/ai-index/check-source";
export function IndexCheckLink({ sourcePage }: { sourcePage: string }) {
  return <CreamLink href="/#free-check" size="md" onClick={() => setIndexCheckSource(sourcePage)}>Run a free check</CreamLink>;
}

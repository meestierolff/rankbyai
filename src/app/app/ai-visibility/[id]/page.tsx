import type { Metadata } from "next";
import { ScanDetailPage } from "@/components/app/scan-pages";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "AI Visibility scan" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession("/app/ai-visibility");
  const { id } = await params;
  return <ScanDetailPage ctx={ctx} kind="ai" scanId={id} />;
}

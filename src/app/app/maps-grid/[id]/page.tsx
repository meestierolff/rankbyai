import type { Metadata } from "next";
import { ScanDetailPage } from "@/components/app/scan-pages";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Maps Grid scan" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession("/app/maps-grid");
  const { id } = await params;
  return <ScanDetailPage ctx={ctx} kind="maps" scanId={id} />;
}

import type { Metadata } from "next";
import { ScanIndexPage } from "@/components/app/scan-pages";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Maps Grid" };

export default async function Page({ searchParams }: { searchParams: Promise<{ business?: string }> }) {
  const ctx = await requireSession("/app/maps-grid");
  const { business } = await searchParams;
  return <ScanIndexPage ctx={ctx} kind="maps" businessId={business} />;
}

import type { Metadata } from "next";
import { ProspectBatchPage } from "@/components/app/prospects-pages";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Prospect batch" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession("/app/prospects");
  const { id } = await params;
  return <ProspectBatchPage ctx={ctx} batchId={id} />;
}

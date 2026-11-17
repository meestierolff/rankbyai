import type { Metadata } from "next";
import { AuditDetailPage } from "@/components/app/audit-pages";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Local AI Audit result" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession("/app/audit");
  const { id } = await params;
  return <AuditDetailPage ctx={ctx} auditId={id} />;
}

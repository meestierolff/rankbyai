import type { Metadata } from "next";
import { AuditIndexPage } from "@/components/app/audit-pages";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Local AI Audit" };

export default async function Page({ searchParams }: { searchParams: Promise<{ business?: string }> }) {
  const ctx = await requireSession("/app/audit");
  const { business } = await searchParams;
  return <AuditIndexPage ctx={ctx} businessId={business} />;
}

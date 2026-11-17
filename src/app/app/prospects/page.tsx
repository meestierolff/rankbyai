import type { Metadata } from "next";
import { ProspectIndexPage } from "@/components/app/prospects-pages";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Prospects" };

export default async function Page() {
  const ctx = await requireSession("/app/prospects");
  return <ProspectIndexPage ctx={ctx} />;
}

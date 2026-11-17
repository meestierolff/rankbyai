import type { Metadata } from "next";
import { ModulePreview } from "@/components/app/module-preview";

export const metadata: Metadata = { title: "Local AI Audit" };

export default function Page() {
  return <ModulePreview title="Local AI Audit" description="A 0–100 score with P0–P3 findings, evidence and fixes." ships="In development." />;
}

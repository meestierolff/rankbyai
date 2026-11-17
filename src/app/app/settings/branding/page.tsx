import type { Metadata } from "next";
import { ModulePreview } from "@/components/app/module-preview";

export const metadata: Metadata = { title: "Branding" };

export default function Page() {
  return <ModulePreview title="Branding" description="Logo, color and website for white-label reports." ships="In development." />;
}

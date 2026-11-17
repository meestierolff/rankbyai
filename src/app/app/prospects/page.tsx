import type { Metadata } from "next";
import { ModulePreview } from "@/components/app/module-preview";

export const metadata: Metadata = { title: "Prospects" };

export default function Page() {
  return <ModulePreview title="Prospects" description="Niche + city in, white-label prospect reports out." ships="In development." />;
}

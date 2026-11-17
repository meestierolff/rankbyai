import type { Metadata } from "next";
import { ModulePreview } from "@/components/app/module-preview";

export const metadata: Metadata = { title: "Businesses" };

export default function Page() {
  return <ModulePreview title="Businesses" description="The businesses you track. Search by name and confirm the Google listing." ships="Ships with the scan engine in the next milestone." />;
}

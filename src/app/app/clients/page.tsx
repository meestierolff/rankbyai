import type { Metadata } from "next";
import { ModulePreview } from "@/components/app/module-preview";

export const metadata: Metadata = { title: "Clients" };

export default function Page() {
  return <ModulePreview title="Clients" description="Group businesses by client." ships="Ships with the scan engine in the next milestone." />;
}

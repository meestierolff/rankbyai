import type { Metadata } from "next";
import { ModulePreview } from "@/components/app/module-preview";

export const metadata: Metadata = { title: "Requests" };

export default function Page() {
  return <ModulePreview title="Requests" description="Feature requests and the changelog." ships="In development." />;
}

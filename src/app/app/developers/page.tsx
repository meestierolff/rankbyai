import type { Metadata } from "next";
import { ModulePreview } from "@/components/app/module-preview";

export const metadata: Metadata = { title: "API & MCP" };

export default function Page() {
  return <ModulePreview title="API & MCP" description="API keys, the REST reference and MCP setup." ships="In development." />;
}

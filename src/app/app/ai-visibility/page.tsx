import type { Metadata } from "next";
import { ModulePreview } from "@/components/app/module-preview";

export const metadata: Metadata = { title: "AI Visibility" };

export default function Page() {
  return <ModulePreview title="AI Visibility" description="Which businesses AI assistants name at each point of a map grid." ships="Ships in the next milestone." />;
}

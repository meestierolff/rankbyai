import type { Metadata } from "next";
import { ModulePreview } from "@/components/app/module-preview";

export const metadata: Metadata = { title: "Maps Grid" };

export default function Page() {
  return <ModulePreview title="Maps Grid" description="Google Maps rank on a grid, from 3×3 to 9×9." ships="Ships in the next milestone." />;
}

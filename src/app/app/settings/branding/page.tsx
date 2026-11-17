import type { Metadata } from "next";
import { BrandingForm } from "@/components/app/m3-controls";
import { PageHeader, Panel } from "@/components/app/ui";
import { requireSession } from "@/lib/auth";
import { signedUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Branding" };

export default async function BrandingPage() {
  const ctx = await requireSession("/app/settings/branding");
  const ws = ctx.workspace;
  let logoUrl: string | null = null;
  if (ws.brand_logo_path && ws.brand_logo_path.startsWith(`${ws.id}/`)) {
    logoUrl = await signedUrl(`brand/${ws.brand_logo_path}`);
  }
  const locked = ws.plan !== "lifetime";
  return (
    <>
      <PageHeader title="Branding" description="Put your agency on share links and PDF reports: logo, name, color and a link to your website." />
      {locked ? (
        <div role="note" className="mb-5 rounded-xl border border-border-strong bg-surface-2 px-4 py-3 text-[14px] text-muted-foreground">White-label branding needs lifetime access.</div>
      ) : null}
      <Panel title="White-label">
        <BrandingForm
          canEdit={ctx.role === "owner" && !locked}
          initial={{
            brand_name: ws.brand_name ?? "", brand_color_hex: ws.brand_color_hex ?? "", brand_website: ws.brand_website ?? "",
            reply_to_email: ws.reply_to_email ?? "", hide_rankbyai_branding: ws.hide_rankbyai_branding, logoUrl,
          }}
        />
      </Panel>
    </>
  );
}

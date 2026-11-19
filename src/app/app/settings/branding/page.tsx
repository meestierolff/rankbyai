import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { CustomDomain } from "@/components/app/custom-domain";
import { BrandingForm } from "@/components/app/m3-controls";
import { RegionalOptIn } from "@/components/app/regional-optin";
import { ErrorState, PageHeader, Panel } from "@/components/app/ui";
import { requireSession } from "@/lib/auth";
import { readWorkspaceDomain, type WorkspaceDomainRow } from "@/lib/domains-server";
import { vercelDomainsEnv } from "@/lib/env";
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
  // A failed read shows an error in the section, never an empty "add a domain" form over a real domain.
  let domain: WorkspaceDomainRow | null = null;
  let domainFailed = false;
  try {
    domain = await readWorkspaceDomain(ws.id);
  } catch (e) {
    unstable_rethrow(e);
    domainFailed = true;
  }
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
            reply_to_email: ws.reply_to_email ?? "", hide_rankbyai_branding: ws.hide_rankbyai_branding,
            report_default_view: ws.report_default_view === "grid" ? "grid" : "map", logoUrl,
          }}
        />
      </Panel>
      <Panel title="Custom domain for report links" className="mt-6">
        {domainFailed ? (
          <ErrorState title="Could not load your domain" body="Reload the page to try again." />
        ) : (
          <CustomDomain
            initial={domain ? { hostname: domain.hostname, status: domain.status, records: domain.records ?? [], last_error: domain.last_error, checked_at: domain.checked_at } : null}
            configured={vercelDomainsEnv.isConfigured()}
            canEdit={ctx.role === "owner"}
            locked={locked}
          />
        )}
      </Panel>
      <Panel title="Public regional pages" className="mt-6">
        <RegionalOptIn initial={ws.share_scans_for_regional_pages} canEdit={ctx.role === "owner"} />
      </Panel>
    </>
  );
}

import { SeoArticle, seoMetadata } from "@/components/marketing/seo-article";
import { LOCAL_SEO_AUDIT_PAGE } from "@/lib/local-seo-audit-page";

// The cached live offer may need refreshing before this product page renders.
// Allow a blocking navigation while preserving server-rendered content and pricing.
export const instant = false;

export const metadata = {
  ...seoMetadata(LOCAL_SEO_AUDIT_PAGE),
  openGraph: { title: LOCAL_SEO_AUDIT_PAGE.h1, description: LOCAL_SEO_AUDIT_PAGE.description, url: LOCAL_SEO_AUDIT_PAGE.path, type: "website" as const },
};

export default function Page() {
  return <SeoArticle page={LOCAL_SEO_AUDIT_PAGE} />;
}

import { SeoArticle, seoMetadata } from "@/components/marketing/seo-article";
import { seoPage } from "@/lib/seo-pages";

const page = seoPage("/blog/local-falcon-pricing")!;

export const metadata = seoMetadata(page);

export default function Page() {
  return <SeoArticle page={page} />;
}

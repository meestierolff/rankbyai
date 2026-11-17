import { SeoArticle, seoMetadata } from "@/components/marketing/seo-article";
import { seoPage } from "@/lib/seo-pages";

const page = seoPage("/local-falcon-vs-brightlocal")!;

export const metadata = seoMetadata(page);

export default function Page() {
  return <SeoArticle page={page} />;
}

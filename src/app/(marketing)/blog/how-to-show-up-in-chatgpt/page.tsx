import { SeoArticle, seoMetadata } from "@/components/marketing/seo-article";
import { seoPage } from "@/lib/seo-pages";

const page = seoPage("/blog/how-to-show-up-in-chatgpt")!;

export const metadata = seoMetadata(page);

export default function Page() {
  return <SeoArticle page={page} />;
}

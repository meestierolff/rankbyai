import type { ReactNode } from "react";
import { Eyebrow } from "@/components/brand/primitives";
import { Footer } from "./footer";
import { Header } from "./header";

/** Shell for every public page that is not the home page (legal, docs, SEO pages, regional pages). */
export function PageShell({ children, hideAiIndexLink = false }: { children: ReactNode; hideAiIndexLink?: boolean }) {
  return (
    <div className="min-h-dvh overflow-x-clip bg-lp-bg">
      <Header withOffer={false} />
      <main>{children}</main>
      <Footer hideAiIndexLink={hideAiIndexLink} />
    </div>
  );
}

/** Long-form text page (legal, guides) in the brand type scale. Children use the `.rb-prose` styles. */
export function ProsePage({ eyebrow, title, updated, intro, children }: { eyebrow: string; title: string; updated?: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <PageShell>
      <article className="container-page pt-[clamp(56px,8vw,104px)] pb-[var(--rb-section-y)]">
        <div className="mx-auto flex max-w-[760px] flex-col gap-5">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="m-0 text-[clamp(36px,5vw,60px)] leading-[1.05] font-semibold tracking-[-0.04em] text-balance">{title}</h1>
          {updated ? <p className="m-0 font-mono text-[13px] text-dim">Last updated {updated}</p> : null}
          {intro ? <p className="text-lead m-0">{intro}</p> : null}
          <div className="rb-prose mt-4">{children}</div>
        </div>
      </article>
    </PageShell>
  );
}

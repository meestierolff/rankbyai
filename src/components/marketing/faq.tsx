import { Chevron, Eyebrow } from "@/components/brand/primitives";
import type { FaqItem } from "@/lib/faq";

/** 9.14 FAQ. Native <details>, server-rendered so the answers are in the HTML. */
export function Faq({ items, title = "Straight answers about AI visibility tracking." }: { items: FaqItem[]; title?: string }) {
  return (
    <section id="faq" className="container-page section-y grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-start gap-[clamp(32px,5vw,64px)]">
      <div className="flex flex-col gap-[22px]">
        <Eyebrow>FAQ</Eyebrow>
        <h2 className="m-0 text-[clamp(34px,4.4vw,52px)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">{title}</h2>
      </div>
      <div className="flex flex-col">
        {items.map((f) => (
          <details key={f.q} className="border-b border-border py-6">
            <summary className="flex justify-between gap-4 text-[18px] font-medium">
              {f.q}
              <Chevron />
            </summary>
            <p className="mt-[14px] mb-0 text-[16px] leading-[1.6] text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

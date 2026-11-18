import type { FaqItem } from "@/lib/faq";
import { cn } from "@/lib/utils";
import { Bezel } from "./lp";

/**
 * 9.14 FAQ. Native <details>, server-rendered, so every answer is in the HTML whether its row is
 * open or not. The first two rows start open. `title` is the line under the heading.
 */
export function Faq({
  items, title = "Straight answers about AI visibility tracking.", heading = "Before you buy.",
}: { items: FaqItem[]; title?: string; heading?: string }) {
  return (
    <section id="faq" className="py-[130px] text-lp-fg">
      <div className="container-lp text-center">
        <h2 className="m-0 text-[clamp(44px,7vw,84px)] leading-none font-semibold tracking-[-0.05em]">{heading}</h2>
        <p className="mt-5 mb-0 text-[17px] text-lp-muted">{title}</p>
      </div>
      <div className="container-lp mt-14">
        <Bezel large innerClassName="bg-[#0b0b0b] px-[clamp(18px,4vw,40px)] py-2">
          {items.map((f, i) => (
            <details key={f.q} open={i < 2} className={cn("group", i > 0 && "border-t border-lp-line-2")}>
              <summary className="flex items-center justify-between gap-4 py-6 text-[clamp(17px,2vw,20px)] font-medium tracking-[-0.01em]">
                <span>{f.q}</span>
                <span aria-hidden className="shrink-0 font-mono text-[18px] text-lp-faint">
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
              </summary>
              <p className="m-0 max-w-[720px] pb-[26px] text-[16.5px] leading-[1.65] text-lp-muted">{f.a}</p>
            </details>
          ))}
        </Bezel>
      </div>
    </section>
  );
}

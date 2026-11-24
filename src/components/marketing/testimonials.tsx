import { safeHttpUrl } from "@/components/report/model";
import { testimonials, type Testimonial } from "@/data/testimonials";
import { LpEyebrow } from "./lp";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A consent date we can stand behind: written as YYYY-MM-DD and a real calendar day. */
function isConsentDate(value: string): boolean {
  const day = value.trim();
  return ISO_DAY.test(day) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}

/**
 * The quotes that may be shown: name, quote and a written-consent date are all present. Any other
 * row is skipped as a whole; nothing is filled in for it.
 */
export function publishableTestimonials(list: readonly Testimonial[]): Testimonial[] {
  return list.filter((t) => !!t.name?.trim() && !!t.quote?.trim() && !!t.consentDate && isConsentDate(t.consentDate));
}

/**
 * Homepage customer quotes, from src/data/testimonials.ts only. With no publishable quote the
 * section does not exist at all: no heading, no placeholder cards.
 * `items` is for tests; the page always uses the data file.
 */
export function Testimonials({ items = testimonials }: { items?: readonly Testimonial[] }) {
  const shown = publishableTestimonials(items);
  if (shown.length === 0) return null;
  return (
    <section id="testimonials" aria-labelledby="testimonials-h" className="py-[110px] text-lp-fg">
      <div className="container-lp">
        <LpEyebrow className="block">Customers</LpEyebrow>
        <h2 id="testimonials-h" className="m-0 mt-4 max-w-[680px] text-[clamp(36px,4.8vw,56px)] leading-[1.02] font-semibold tracking-[-0.045em] text-balance">
          What agencies say
        </h2>
        <div className="mt-12 grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-5">
          {shown.map((t) => (
            <figure key={`${t.name}|${t.consentDate}`} className="m-0 flex flex-col gap-6 rounded-[22px] border border-lp-line-2 bg-[linear-gradient(180deg,#121212,#0a0a0a)] p-[clamp(22px,3vw,30px)]">
              <blockquote className="m-0 text-[17px] leading-[1.6] text-lp-fg-2">&ldquo;{t.quote.trim()}&rdquo;</blockquote>
              <figcaption className="mt-auto text-[14.5px] leading-[1.5]">
                <Person t={t} />
                {t.role || t.company ? (
                  <span className="block text-lp-muted">{[t.role, t.company].map((s) => s?.trim()).filter(Boolean).join(", ")}</span>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The person's name, linked only when the row carries a safe http(s) URL. */
function Person({ t }: { t: Testimonial }) {
  const href = safeHttpUrl(t.url);
  const name = t.name.trim();
  if (!href) return <span className="block font-medium text-lp-fg">{name}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="block font-medium text-lp-fg underline decoration-lp-border-3 underline-offset-[3px] hover:decoration-lp-fg">
      {name}
    </a>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { ctaClass, secondaryClass } from "@/components/brand/primitives";
import { cn } from "@/lib/utils";

/* App-side building blocks. Same tokens, radii and type as the landing page. */

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-[6px]">
        <h1 className="m-0 text-[clamp(24px,2.6vw,32px)] leading-[1.1] font-semibold tracking-[-0.035em] break-words">{title}</h1>
        {description ? <p className="m-0 max-w-[720px] text-[15px] leading-normal text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** The card every page section sits in: #0e0e0e on black with a hairline, as inside the landing frames. */
export const cardClass = "rounded-[14px] border border-border bg-surface";

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn(cardClass, "min-w-0", className)}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-[14px]">
          <h2 className="m-0 text-[15px] font-medium text-fg">{title}</h2>
          {action}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className={cn(cardClass, "flex min-w-0 flex-col gap-[10px] p-5")}>
      <span className="font-mono text-[11.5px] leading-none tracking-[0.08em] text-muted-foreground uppercase">{label}</span>
      <span className={cn("font-mono text-[28px] leading-[1.05] font-semibold tracking-[-0.02em] break-words", tone === "good" && "text-g1", tone === "warn" && "text-amber", tone === "bad" && "text-orange")}>
        {value}
      </span>
      {hint ? <span className="text-[13px] leading-normal text-dim">{hint}</span> : null}
    </div>
  );
}

/** Nothing here yet. `action` is the ONE primary action of the page; leave it out when a form on the same page is that action. */
export function EmptyState({ title, body, action }: { title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[14px] border border-dashed border-border-strong bg-inset p-[clamp(20px,4vw,32px)]">
      <span className="text-[17px] font-semibold">{title}</span>
      <p className="m-0 max-w-[560px] text-[15px] leading-normal text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", body }: { title?: string; body: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-[14px] border border-danger/50 bg-danger-fill p-5">
      <span className="text-[15px] font-semibold">{title}</span>
      <p className="m-0 text-[14px] leading-normal text-fg-2">{body}</p>
    </div>
  );
}

/** A plain statement next to a form or a page: what is switched off, what something needs. Not an error. */
export function Note({ children, tone = "plain", className }: { children: ReactNode; tone?: "plain" | "warn"; className?: string }) {
  return (
    <div role="note" className={cn("rounded-xl border bg-surface-2 px-4 py-3 text-[14px] leading-normal", tone === "warn" ? "border-amber/50 text-amber" : "border-border-strong text-muted-foreground", className)}>
      {children}
    </div>
  );
}

export function StatusChip({ tone, children }: { tone: "good" | "warn" | "bad" | "idle"; children: ReactNode }) {
  const map = { good: "border-g2 text-g1", warn: "border-amber/60 text-amber", bad: "border-danger/60 text-danger", idle: "border-border-strong text-dim" } as const;
  return <span className={cn("inline-flex items-center rounded-full border px-[10px] py-[3px] font-mono text-[11px] font-medium tracking-[0.04em] whitespace-nowrap uppercase", map[tone])}>{children}</span>;
}

export const PrimaryLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className={ctaClass("sm")}><span>{children}</span><span aria-hidden>→</span></Link>
);
export const SecondaryLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className={secondaryClass()}>{children}</Link>
);

/** Shown across /app while the workspace has not bought lifetime access. */
export function LockedBanner() {
  return (
    <div role="note" className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-inset px-[clamp(16px,3vw,32px)] py-[10px] text-[14px]">
      <span className="text-muted-foreground">
        You are looking around with <span className="text-fg">sample data</span>. Running real scans needs lifetime access.
      </span>
      <Link href="/app/billing" className={ctaClass("sm", "py-[7px] text-[14px]")}><span>Get lifetime access</span><span aria-hidden>→</span></Link>
    </div>
  );
}

export const inputClass =
  "w-full rounded-[10px] border border-border-strong bg-inset px-[14px] py-[10px] text-[15px] text-fg placeholder:text-faint transition-colors hover:border-border-heavy disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border-strong";
export const labelClass = "text-[14px] font-medium text-fg";

export const fmtUsd = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 4) });
/**
 * Server-side timestamp, always UTC and labelled so. Inside /app use <LocalTime> from
 * ./local-time instead, which shows the viewer's own zone; this stays for the operator's /admin page.
 */
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC" : "—";

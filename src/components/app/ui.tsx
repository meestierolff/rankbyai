import Link from "next/link";
import type { ReactNode } from "react";
import { ctaClass, secondaryClass } from "@/components/brand/primitives";
import { cn } from "@/lib/utils";

/* App-side building blocks. Same tokens, radii and type as the marketing site. */

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-[6px]">
        <h1 className="m-0 text-[clamp(24px,2.6vw,32px)] leading-[1.15] font-semibold tracking-[-0.03em]">{title}</h1>
        {description ? <p className="m-0 max-w-[720px] text-[15px] leading-normal text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-surface", className)}>
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-[14px]">
          <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
          {action}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-[28px] leading-none font-semibold tracking-[-0.02em]", tone === "good" && "text-g1", tone === "warn" && "text-amber", tone === "bad" && "text-orange")}>
        {value}
      </span>
      {hint ? <span className="text-[13px] leading-normal text-dim">{hint}</span> : null}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border-strong bg-inset p-8">
      <span className="text-[17px] font-semibold">{title}</span>
      <p className="m-0 max-w-[560px] text-[15px] leading-normal text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", body }: { title?: string; body: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-danger/50 bg-danger-fill p-5">
      <span className="text-[15px] font-semibold">{title}</span>
      <p className="m-0 text-[14px] leading-normal text-fg-2">{body}</p>
    </div>
  );
}

export function StatusChip({ tone, children }: { tone: "good" | "warn" | "bad" | "idle"; children: ReactNode }) {
  const map = { good: "border-g2 text-g1", warn: "border-amber/60 text-amber", bad: "border-danger/60 text-danger", idle: "border-border-strong text-dim" } as const;
  return <span className={cn("inline-flex items-center rounded-full border px-[10px] py-[3px] font-mono text-[11px] font-medium tracking-[0.04em] uppercase", map[tone])}>{children}</span>;
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
    <div role="note" className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2 px-[clamp(16px,3vw,32px)] py-[10px] text-[14px]">
      <span className="text-muted-foreground">
        You are looking around with <span className="text-fg">sample data</span>. Running real scans needs lifetime access.
      </span>
      <Link href="/app/billing" className={ctaClass("sm", "py-[7px] text-[14px]")}><span>Get lifetime access</span><span aria-hidden>→</span></Link>
    </div>
  );
}

export const inputClass =
  "w-full rounded-[10px] border border-border-strong bg-inset px-[14px] py-[10px] text-[15px] text-fg placeholder:text-faint disabled:opacity-50";
export const labelClass = "text-[14px] font-medium text-fg";

export const fmtUsd = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 4) });
export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "—";
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

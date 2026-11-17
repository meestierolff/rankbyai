import type { ReactNode } from "react";
import { SampleTag } from "@/components/brand/primitives";
import { PageHeader } from "./ui";

/** A module that has not shipped yet: says so plainly and shows a labelled sample of what it will do. */
export function ModulePreview({ title, description, ships, children }: { title: string; description: string; ships: string; children?: ReactNode }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div role="note" className="mb-6 rounded-2xl border border-border-strong bg-surface-2 px-5 py-4 text-[15px] leading-normal text-muted-foreground">
        <span className="font-semibold text-fg">Not live yet.</span> {ships}
      </div>
      {children ? (
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-2 text-[13px] text-dim"><SampleTag /> A preview of this screen with fictional data</span>
          <div className="overflow-hidden rounded-2xl border border-border bg-bg-alt p-[clamp(12px,2vw,24px)]">{children}</div>
        </div>
      ) : null}
    </>
  );
}

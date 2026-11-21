"use client";

import { useEffect, useState } from "react";
import { ctaClass, secondaryClass } from "@/components/brand/primitives";

interface Pitch {
  business: string;
  report_url: string;
  image_url: string;
  email: { subject: string | null; text: string; lines: string[] };
  omitted: { line: string; reason: string }[];
  note: string;
}

/** The image is opened from this site in the app (a download link only works on the same origin). */
const samePath = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

const fileName = (name: string) => `${name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "report"}-teaser.png`;

function CopyButton({ text, label, primary = false }: { text: string; label: string; primary?: boolean }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className={primary ? ctaClass("sm", "cursor-pointer border-0") : secondaryClass("cursor-pointer")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("copied");
        } catch {
          setState("failed");
        }
      }}
    >
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Select the text and copy it" : label}</span>
    </button>
  );
}

/**
 * The email teaser of one prospect report: a short email to copy, its image to download, and the
 * report link. Copy and download only: RankbyAI never sends email.
 */
export function PitchPanel({ batchId, businessId }: { batchId: string; businessId: string }) {
  const [pitch, setPitch] = useState<Pitch | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const res = await fetch(`/api/prospects/${batchId}/pitch?business_id=${businessId}`, { cache: "no-store" }).catch(() => null);
      const body = res ? ((await res.json().catch(() => null)) as (Pitch & { message?: string }) | null) : null;
      if (!live) return;
      if (res?.ok && body?.email) setPitch(body);
      else setProblem(body?.message ?? "The teaser could not be loaded. Try again.");
    })();
    return () => { live = false; };
  }, [batchId, businessId]);

  if (problem) return <p role="alert" className="m-0 text-[14px] text-danger">{problem}</p>;
  if (!pitch) return <p className="m-0 text-[14px] text-muted-foreground">Loading the teaser…</p>;
  const image = samePath(pitch.image_url);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1fr]">
      <div className="flex min-w-0 flex-col gap-3">
        {pitch.email.subject ? (
          <p className="m-0 text-[13px] text-dim">Subject: <span className="text-fg-2">{pitch.email.subject}</span></p>
        ) : null}
        <pre className="m-0 max-h-[300px] overflow-auto rounded-xl border border-border bg-inset p-4 font-sans text-[14px] leading-[1.6] whitespace-pre-wrap text-fg-2">{pitch.email.text}</pre>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={pitch.email.text} label="Copy email" primary />
          {pitch.email.subject ? <CopyButton text={pitch.email.subject} label="Copy subject" /> : null}
          <CopyButton text={pitch.report_url} label="Copy report link" />
        </div>
        {pitch.omitted.length ? (
          <p className="m-0 text-[13px] leading-normal text-dim">Left out, because the report has no data for it: {pitch.omitted.filter((o) => o.line !== "report_link").map((o) => o.reason.replace(/\.$/, "").toLowerCase()).join("; ")}.</p>
        ) : null}
        <p className="m-0 text-[12px] leading-normal text-dim">{pitch.note}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a generated PNG, shown as it will be sent */}
        <img src={image} alt={`Comparison image for ${pitch.business}`} width={1200} height={630} className="h-auto w-full rounded-xl border border-border" />
        <a href={image} download={fileName(pitch.business)} className={secondaryClass("w-fit no-underline")}>Download image</a>
      </div>
    </div>
  );
}

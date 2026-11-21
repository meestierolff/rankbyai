"use client";

import type { ChangeNote } from "@/lib/scans/change-note";
import { secondaryClass } from "@/components/brand/primitives";
import { CopyButton } from "./copy-button";

const signed = (n: number, unit = "") => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n)}${unit}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function download(markdown: string, business: string) {
  const name = `${business.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "business"}-why-it-changed.md`;
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "Why it changed": the note on two AI scans, with copy and Markdown download. Nothing is sent anywhere. */
export function ChangeNotePanel({ note, markdown }: { note: ChangeNote; markdown: string }) {
  if (note.status === "not_ready") return <p className="m-0 text-[14px] text-muted-foreground">{note.message}</p>;
  const { names, sources } = note;
  return (
    <div className="flex flex-col gap-5 text-[14px] leading-normal">
      {note.comparable.notes.map((n) => <p key={n} role="note" className="m-0 rounded-lg border border-amber/50 bg-surface-2 px-3 py-2 text-amber">{n}</p>)}

      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-[13px] font-medium tracking-[0.05em] text-dim uppercase">Per engine</h3>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {note.engines.map((e) => (
            <li key={e.engine}>
              <span className="font-medium">{e.label}: </span>
              {e.before && e.after ? (
                <>
                  named in {e.before.named}/{e.before.answers} → {e.after.named}/{e.after.answers} answers ({signed(e.mention_rate_change!, " pts")})
                  {e.avg_position_change != null ? <>; average position {e.before.avg_position} → {e.after.avg_position}</> : null}
                </>
              ) : <span className="text-dim">not in both checks, so not compared</span>}
            </li>
          ))}
        </ul>
      </div>

      {names.appeared.length || names.disappeared.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-[13px] font-medium tracking-[0.05em] text-dim uppercase">Businesses named instead</h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {names.appeared.map((x) => <li key={`a-${x.name}`}><span className="text-g1">New</span> {x.name}, in {plural(x.answers_after, "answer")}</li>)}
            {names.disappeared.map((x) => <li key={`d-${x.name}`}><span className="text-orange">Gone</span> {x.name}, in {plural(x.answers_before, "answer")} before</li>)}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-[13px] font-medium tracking-[0.05em] text-dim uppercase">Cited sources</h3>
        {sources.added.length || sources.removed.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {sources.added.map((x) => <li key={`a-${x.domain}`}><span className="text-g1">New</span> {x.domain}, in {plural(x.answers_after, "answer")} ({x.engines.join(", ")}){x.with_business ? `, ${x.with_business} of them naming the business` : ""}</li>)}
            {sources.removed.map((x) => <li key={`r-${x.domain}`}><span className="text-orange">Gone</span> {x.domain}, in {plural(x.answers_before, "answer")} before ({x.engines.join(", ")}){x.with_business ? `, ${x.with_business} of them naming the business` : ""}</li>)}
          </ul>
        ) : <p className="m-0 text-dim">{sources.cited_before || sources.cited_after ? "The same sources were cited in both checks." : "No cited sources were stored for these answers."}</p>}
      </div>

      {note.possible_reasons.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-[13px] font-medium tracking-[0.05em] text-dim uppercase">Possible reasons (leads, from stored evidence)</h3>
          <ul className="m-0 flex flex-col gap-1 pl-5">{note.possible_reasons.map((r) => <li key={r.text}>{r.text}</li>)}</ul>
        </div>
      ) : null}

      <p className="m-0 text-[13px] text-dim">{note.disclaimer}</p>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={markdown} label="Copy the note" primary />
        <button type="button" onClick={() => download(markdown, note.business)} className={secondaryClass("cursor-pointer")}>Download .md</button>
      </div>
    </div>
  );
}

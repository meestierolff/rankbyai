"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ctaClass } from "@/components/brand/primitives";
import { inputClass, labelClass } from "./ui";

const send = (url: string, method: string, body?: unknown) => fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
const messageOf = async (res: Response, fallback: string) => ((await res.json().catch(() => ({}))) as { message?: string }).message ?? fallback;

export function AddClient({ locked }: { locked: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setProblem(null);
        const res = await send("/api/clients", "POST", { name, notes });
        setBusy(false);
        if (!res.ok) return setProblem(await messageOf(res, "The client could not be saved."));
        setName("");
        setNotes("");
        router.refresh();
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-[6px]"><span className={labelClass}>Client name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required placeholder="Northgate Family Dental" className={inputClass} /></label>
        <label className="flex flex-col gap-[6px]"><span className={labelClass}>Notes (optional)</span><input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Contact, plan, renewal date" className={inputClass} /></label>
      </div>
      {problem ? <p role="alert" className="m-0 text-[14px] text-danger">{problem}</p> : null}
      <button type="submit" disabled={busy || locked || !name.trim()} className={ctaClass("sm", "w-fit cursor-pointer border-0")}><span>{busy ? "Saving…" : locked ? "Needs lifetime access" : "Add client"}</span></button>
    </form>
  );
}

export function DeleteClient({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirming) return <button type="button" onClick={() => setConfirming(true)} className="cursor-pointer rounded-[8px] border border-border-strong bg-transparent px-[10px] py-[5px] text-[13px] font-medium text-fg hover:bg-line">Delete</button>;
  return (
    <span className="flex items-center gap-2 text-[13px]">
      <span className="text-muted-foreground">Delete {name}? Its businesses stay.</span>
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); await send(`/api/clients/${id}`, "DELETE"); router.refresh(); }} className="cursor-pointer rounded-[8px] border border-danger/50 bg-transparent px-[10px] py-[5px] font-medium text-danger">{busy ? "Deleting…" : "Yes, delete"}</button>
      <button type="button" onClick={() => setConfirming(false)} className="cursor-pointer rounded-[8px] border border-border-strong bg-transparent px-[10px] py-[5px] font-medium text-fg">Keep</button>
    </span>
  );
}

export function NewRequest() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setNote(null);
        const res = await send("/api/requests", "POST", { title, body });
        setBusy(false);
        if (!res.ok) return setNote({ ok: false, text: await messageOf(res, "The request could not be saved.") });
        setTitle("");
        setBody("");
        setNote({ ok: true, text: "Thanks. Your request is on the list." });
        router.refresh();
      }}
    >
      <label className="flex flex-col gap-[6px]"><span className={labelClass}>What should RankbyAI do?</span><input value={title} onChange={(e) => setTitle(e.target.value)} minLength={3} maxLength={140} required placeholder="Export a scan as a spreadsheet" className={inputClass} /></label>
      <label className="flex flex-col gap-[6px]"><span className={labelClass}>Details (optional)</span><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={4000} className={inputClass} /></label>
      {note ? <p role={note.ok ? "status" : "alert"} className={`m-0 text-[14px] ${note.ok ? "text-g1" : "text-danger"}`}>{note.text}</p> : null}
      <button type="submit" disabled={busy || title.trim().length < 3} className={ctaClass("sm", "w-fit cursor-pointer border-0")}><span>{busy ? "Sending…" : "Send request"}</span></button>
      <span className="text-[13px] text-dim">Requests are visible to every RankbyAI user, without your name or workspace.</span>
    </form>
  );
}

export function VoteButton({ id, votes }: { id: string; votes: number }) {
  const [count, setCount] = useState(votes);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button" disabled={busy} aria-label={`Vote for this request. ${count} ${count === 1 ? "vote" : "votes"} so far.`}
      onClick={async () => {
        setBusy(true);
        const res = await send(`/api/requests/${id}/vote`, "POST");
        const json = (await res.json().catch(() => ({}))) as { votes?: number };
        if (res.ok && typeof json.votes === "number") setCount(json.votes);
        setBusy(false);
      }}
      className="flex w-[58px] shrink-0 cursor-pointer flex-col items-center rounded-[10px] border border-border-strong bg-inset py-2 text-fg hover:bg-line disabled:opacity-60"
    >
      <span aria-hidden className="text-[12px] leading-none">▲</span>
      <span className="font-mono text-[16px] font-semibold">{count}</span>
    </button>
  );
}

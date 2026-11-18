"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ctaClass, secondaryClass } from "@/components/brand/primitives";
import { LocalTime } from "./local-time";
import { StatusChip, inputClass, labelClass } from "./ui";

export interface KeyRow { id: string; name: string; prefix: string; last_used_at: string | null; revoked_at: string | null; created_at: string }

function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button" aria-live="polite" className={secondaryClass("cursor-pointer py-[6px] text-[13px]")}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the text stays selectable */ }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function ApiKeys({ keys, canManage, locked, limit }: { keys: KeyRow[]; canManage: boolean; locked: boolean; limit: number }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ key: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const active = keys.filter((k) => !k.revoked_at);

  const create = async () => {
    setBusy(true);
    setProblem(null);
    const res = await fetch("/api/developer/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const json = (await res.json().catch(() => ({}))) as { key?: string; message?: string };
    setBusy(false);
    if (!res.ok || !json.key) return setProblem(json.message ?? "The key could not be created.");
    setFresh({ key: json.key, name });
    setName("");
    router.refresh();
  };
  const revoke = async (id: string) => {
    setProblem(null);
    const res = await fetch(`/api/developer/keys/${id}`, { method: "DELETE" });
    if (!res.ok) setProblem(((await res.json().catch(() => ({}))) as { message?: string }).message ?? "The key could not be revoked.");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-5">
      {fresh ? (
        <div role="status" className="flex flex-col gap-3 rounded-xl border border-g2 bg-inset p-4">
          <span className="text-[15px] font-semibold">Your new key “{fresh.name}”. Copy it now: it is not shown again.</span>
          <div className="flex flex-wrap items-center gap-3">
            <code className="min-w-0 flex-1 rounded-lg bg-bg px-3 py-2 font-mono text-[14px] break-all text-fg">{fresh.key}</code>
            <Copy text={fresh.key} label="Copy key" />
          </div>
          <span className="text-[13px] text-dim">We store only a hash of it. If you lose it, revoke it and create a new one.</span>
        </div>
      ) : null}

      {keys.length === 0 ? <p className="m-0 text-[15px] text-muted-foreground">No API keys yet. {canManage ? "Name one below to create it." : ""}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
            <thead><tr className="text-[13px] text-dim">{["Name", "Key", "Last used", "Created", "Status", ""].map((h, i) => <th key={i} scope="col" className="border-b border-line px-3 py-2 font-medium first:pl-0">{h}</th>)}</tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-3 pl-0 font-medium">{k.name}</td>
                  <td className="px-3 py-3 font-mono text-muted-foreground">{k.prefix}…</td>
                  <td className="px-3 py-3 text-muted-foreground">{k.last_used_at ? <LocalTime iso={k.last_used_at} mode="date" /> : "never"}</td>
                  <td className="px-3 py-3 text-muted-foreground"><LocalTime iso={k.created_at} mode="date" /></td>
                  <td className="px-3 py-3"><StatusChip tone={k.revoked_at ? "idle" : "good"}>{k.revoked_at ? "revoked" : "active"}</StatusChip></td>
                  <td className="px-3 py-3 text-right">{!k.revoked_at && canManage ? <button type="button" onClick={() => revoke(k.id)} className="cursor-pointer rounded-[8px] border border-danger/50 bg-transparent px-[10px] py-[5px] text-[13px] font-medium text-danger">Revoke</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage ? (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <label className="flex min-w-[220px] flex-1 flex-col gap-[6px]">
            <span className={labelClass}>New key name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Claude Desktop" className={inputClass} />
          </label>
          <button type="submit" disabled={busy || locked || !name.trim() || active.length >= limit} className={ctaClass("sm", "cursor-pointer border-0")}>
            <span>{busy ? "Creating…" : locked ? "Needs lifetime access" : "Create key"}</span>
          </button>
          <span className="w-full text-[13px] text-dim">{active.length} of {limit} active keys. A key can do everything you can do in this workspace, including spending credits: keep it secret.</span>
        </form>
      ) : <p className="m-0 text-[13px] text-dim">Only the workspace owner can create or revoke keys.</p>}
      {problem ? <p role="alert" className="m-0 text-[14px] text-danger">{problem}</p> : null}
    </div>
  );
}

export function Snippets({ items }: { items: { id: string; title: string; where: string; code: string }[] }) {
  return (
    <div className="flex flex-col gap-4">
      {items.map((s) => (
        <div key={s.id} className="flex flex-col gap-2 rounded-xl border border-border bg-inset p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col"><span className="text-[15px] font-semibold">{s.title}</span><span className="text-[13px] text-dim">{s.where}</span></div>
            <Copy text={s.code} />
          </div>
          <pre tabIndex={0} className="m-0 overflow-auto rounded-lg bg-bg p-3 font-mono text-[13px] leading-relaxed text-fg-2">{s.code}</pre>
        </div>
      ))}
    </div>
  );
}

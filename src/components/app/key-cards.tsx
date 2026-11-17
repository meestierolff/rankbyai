"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ctaClass, secondaryClass } from "@/components/brand/primitives";
import { track } from "@/lib/analytics";
import { StatusChip, inputClass, labelClass } from "./ui";

export interface KeyCard {
  provider: "dataforseo" | "openai" | "perplexity" | "gemini";
  title: string;
  use: string;
  signupUrl: string;
  signupLabel: string;
  note?: string;
  saved: { hint: string | null; status: "valid" | "invalid" | "unchecked"; balance: number | null; validatedAt: string | null } | null;
}

/** One card per vendor: Test & save, status, hint, balance, Replace, Delete. Keys are write-only. */
export function KeyCards({ cards, canEdit }: { cards: KeyCard[]; canEdit: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {cards.map((c) => (
        <Card key={c.provider} card={c} canEdit={canEdit} />
      ))}
    </div>
  );
}

function Card({ card, canEdit }: { card: KeyCard; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!card.saved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const isDfs = card.provider === "dataforseo";

  const save = async (form: FormData) => {
    setBusy(true);
    setMsg(null);
    const body = isDfs
      ? { provider: card.provider, login: form.get("login"), password: form.get("password") }
      : { provider: card.provider, key: form.get("key") };
    const res = await fetch("/api/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { message?: string };
    setBusy(false);
    track("key_saved", { provider: card.provider, valid: res.ok });
    setMsg({ ok: res.ok, text: json.message ?? (res.ok ? "Saved." : "The key was rejected.") });
    if (res.ok) {
      setEditing(false);
      router.refresh();
    }
  };

  const deleteKey = async () => {
    setBusy(true);
    const res = await fetch(`/api/keys?provider=${card.provider}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: "Key deleted." });
      setEditing(true);
      router.refresh();
    } else setMsg({ ok: false, text: "The key could not be deleted." });
  };

  const tone = !card.saved ? "idle" : card.saved.status === "valid" ? "good" : card.saved.status === "invalid" ? "bad" : "warn";

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5" aria-label={`${card.title} key`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-[17px] font-semibold">{card.title}</h2>
          <p className="m-0 text-[14px] leading-normal text-muted-foreground">{card.use}</p>
        </div>
        <StatusChip tone={tone}>{card.saved ? card.saved.status : "not set"}</StatusChip>
      </div>

      {card.saved && !editing ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-inset px-4 py-3">
          <span className="flex flex-col">
            <span className="font-mono text-[14px]">{card.saved.hint ?? "saved"}</span>
            <span className="text-[13px] text-dim">
              {card.saved.balance != null ? `Balance $${Number(card.saved.balance).toFixed(2)} · ` : ""}
              {card.saved.validatedAt
                ? `tested ${new Date(card.saved.validatedAt).toLocaleDateString("en-US", { day: "numeric", month: "short" })}`
                : "not tested"}
            </span>
          </span>
          {canEdit ? (
            <span className="flex gap-2">
              <button type="button" className={secondaryClass("cursor-pointer bg-transparent")} onClick={() => setEditing(true)}>
                Replace
              </button>
              <button type="button" disabled={busy} className={secondaryClass("cursor-pointer border-danger/50 bg-transparent text-danger")} onClick={deleteKey}>
                Delete
              </button>
            </span>
          ) : null}
        </div>
      ) : canEdit ? (
        <form action={save} className="flex flex-col gap-3">
          {isDfs ? (
            <>
              <label className="flex flex-col gap-[6px]">
                <span className={labelClass}>API login (email)</span>
                <input name="login" type="email" required autoComplete="off" className={inputClass} />
              </label>
              <label className="flex flex-col gap-[6px]">
                <span className={labelClass}>API password</span>
                <input name="password" type="password" required autoComplete="off" className={inputClass} />
              </label>
            </>
          ) : (
            <label className="flex flex-col gap-[6px]">
              <span className={labelClass}>API key</span>
              <input name="key" type="password" required minLength={12} autoComplete="off" spellCheck={false} className={inputClass} />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy} className={ctaClass("sm", "cursor-pointer border-0")}>
              <span>{busy ? "Testing…" : "Test & save"}</span>
            </button>
            {card.saved ? (
              <button type="button" className={secondaryClass("cursor-pointer bg-transparent")} onClick={() => setEditing(false)}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="m-0 text-[14px] text-dim">Only the workspace owner can change keys.</p>
      )}

      {msg ? (
        <p role={msg.ok ? "status" : "alert"} className={`m-0 text-[14px] ${msg.ok ? "text-g1" : "text-danger"}`}>
          {msg.text}
        </p>
      ) : null}
      <p className="m-0 text-[13px] leading-normal text-dim">
        {card.note ? `${card.note} ` : ""}
        <a href={card.signupUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          {card.signupLabel}
        </a>
      </p>
    </section>
  );
}

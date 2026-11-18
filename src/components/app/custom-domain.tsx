"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ctaClass, secondaryClass } from "@/components/brand/primitives";
import { checkCustomHostname, type DnsRecord, type DomainStatus } from "@/lib/domains";
import { LocalTime } from "./local-time";
import { inputClass, labelClass, Note, StatusChip } from "./ui";

export interface CustomDomainView {
  hostname: string;
  status: DomainStatus;
  records: DnsRecord[];
  last_error: string | null;
  checked_at: string | null;
}

const STATUS: Record<DomainStatus, { tone: "good" | "warn" | "bad"; label: string }> = {
  active: { tone: "good", label: "Active" },
  pending: { tone: "warn", label: "Waiting for DNS" },
  verifying: { tone: "warn", label: "Waiting for verification" },
  error: { tone: "bad", label: "Needs attention" },
};

const smallBtn = "cursor-pointer rounded-[8px] border border-border-strong bg-transparent px-[10px] py-[5px] text-[13px] font-medium text-fg hover:bg-line disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Report links on the agency's own domain (reports.agency.com/r/…). Owner-only actions; members see
 * the status. `configured` false: the server has no Vercel token, so nothing can be submitted.
 */
export function CustomDomain({ initial, configured, canEdit, locked }: { initial: CustomDomainView | null; configured: boolean; canEdit: boolean; locked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "add" | "check" | "remove">(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const domain = initial;
  const usable = configured && canEdit && !locked;

  const send = async (kind: "add" | "check" | "remove", url: string, init: RequestInit, done: string) => {
    setBusy(kind);
    setMsg(null);
    const res = await fetch(url, init).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(null);
    if (!res?.ok) return setMsg({ ok: false, text: body?.message ?? "That did not work. Try again." });
    setMsg({ ok: true, text: done });
    setConfirmRemove(false);
    router.refresh();
  };

  const add = async (form: FormData) => {
    const check = checkCustomHostname(String(form.get("hostname") ?? ""));
    if (!check.ok) return setMsg({ ok: false, text: check.message });
    await send("add", "/api/domains", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hostname: check.hostname }) }, "Domain added. Now create the DNS record below.");
  };

  const copy = (value: string) => {
    void navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(value);
    setTimeout(() => setCopied(null), 1600);
  };

  const notice = !configured ? (
    <Note>Custom domains are not switched on yet. Report links use rankbyai.live for now.</Note>
  ) : locked ? (
    <Note>Custom domains need lifetime access.</Note>
  ) : !canEdit ? (
    <Note>Ask the workspace owner to change the domain.</Note>
  ) : null;

  if (!domain) {
    return (
      <div className="flex flex-col gap-4">
        <p className="m-0 max-w-[680px] text-[15px] leading-normal text-muted-foreground">
          Send report links from your own domain, for example <span className="font-mono text-fg">reports.youragency.com/r/…</span>. Use a subdomain: your main website stays where it is.
        </p>
        {notice}
        <form action={add} className="flex max-w-[640px] flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-[1_1_280px] flex-col gap-[6px]">
            <span className={labelClass}>Domain</span>
            <input name="hostname" placeholder="reports.youragency.com" autoComplete="off" spellCheck={false} maxLength={253} className={inputClass} disabled={!usable || busy !== null} />
          </label>
          <button type="submit" disabled={!usable || busy !== null} className={ctaClass("sm", "cursor-pointer border-0")}>
            <span>{busy === "add" ? "Adding…" : "Add domain"}</span>
          </button>
        </form>
        {msg ? <p role={msg.ok ? "status" : "alert"} className={`m-0 text-[14px] ${msg.ok ? "text-g1" : "text-danger"}`}>{msg.text}</p> : null}
      </div>
    );
  }

  const chip = STATUS[domain.status];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[15px] break-all text-fg">{domain.hostname}</span>
        <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
      </div>
      {notice}

      {domain.status === "active" ? (
        <p className="m-0 max-w-[680px] text-[15px] leading-normal text-muted-foreground">
          New share links use <span className="font-mono text-fg">https://{domain.hostname}/r/…</span>. Keep the DNS record below in place.
        </p>
      ) : domain.status === "error" ? (
        <p className="m-0 max-w-[680px] text-[15px] leading-normal text-danger">{domain.last_error ?? "Something is wrong with this domain. Remove it and add it again."}</p>
      ) : (
        <p className="m-0 max-w-[680px] text-[15px] leading-normal text-muted-foreground">
          Add {domain.records.length === 1 ? "this record" : "these records"} at the company where you manage DNS for your domain, then press Check again. DNS changes can take from a few minutes to a few hours. Until the domain is active, links use rankbyai.live.
        </p>
      )}

      {domain.records.length ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-line text-[12px] tracking-[0.04em] text-dim uppercase">
                <th className="px-4 py-[10px] font-medium">Type</th>
                <th className="px-4 py-[10px] font-medium">Name</th>
                <th className="px-4 py-[10px] font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {domain.records.map((r) => (
                <tr key={`${r.type}-${r.host}-${r.value}`} className="border-b border-line last:border-0 align-top">
                  <td className="px-4 py-3 font-mono">{r.type}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono break-all">{r.name}</span>
                    {r.name !== r.host ? <span className="block text-[12px] text-dim break-all">{r.host}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 font-mono break-all">{r.value}</span>
                      <button type="button" className={`${smallBtn} shrink-0`} onClick={() => copy(r.value)}>{copied === r.value ? "Copied" : "Copy"}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : domain.status !== "active" && domain.status !== "error" ? (
        <p className="m-0 text-[14px] text-dim">The DNS record to create is not available yet. Press Check again in a minute.</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 text-[13px] text-dim">
        {domain.status !== "active" ? (
          <button type="button" disabled={!usable || busy !== null} className={ctaClass("sm", "cursor-pointer border-0")} onClick={() => send("check", "/api/domains/check", { method: "POST" }, "Status updated.")}>
            <span>{busy === "check" ? "Checking…" : "Check again"}</span>
          </button>
        ) : (
          <button type="button" disabled={!usable || busy !== null} className={secondaryClass("cursor-pointer")} onClick={() => send("check", "/api/domains/check", { method: "POST" }, "Status updated.")}>
            {busy === "check" ? "Checking…" : "Check again"}
          </button>
        )}
        {!confirmRemove ? (
          <button type="button" disabled={!configured || !canEdit || busy !== null} className={secondaryClass("cursor-pointer border-[rgba(239,91,91,0.45)] text-danger")} onClick={() => setConfirmRemove(true)}>
            Remove domain
          </button>
        ) : null}
        {domain.checked_at ? <span>Last checked <LocalTime iso={domain.checked_at} /></span> : null}
      </div>

      {confirmRemove ? (
        <div role="group" aria-label="Confirm remove" className="flex flex-col gap-3">
          <p className="m-0 text-[14px] leading-normal text-fg">
            Remove <strong>{domain.hostname}</strong>? Links on it stop working; the same reports stay available on rankbyai.live. You can then delete the DNS record.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy !== null}
              aria-busy={busy === "remove"}
              className="cursor-pointer rounded-[9px] border border-danger bg-danger px-[14px] py-[9px] text-[14px] font-medium text-white disabled:opacity-60"
              onClick={() => send("remove", "/api/domains", { method: "DELETE" }, "Domain removed.")}
            >
              {busy === "remove" ? "Removing…" : "Yes, remove it"}
            </button>
            <button type="button" disabled={busy !== null} className={secondaryClass("cursor-pointer")} onClick={() => setConfirmRemove(false)}>Cancel</button>
          </div>
        </div>
      ) : null}

      {msg ? <p role={msg.ok ? "status" : "alert"} className={`m-0 text-[14px] ${msg.ok ? "text-g1" : "text-danger"}`}>{msg.text}</p> : null}
    </div>
  );
}

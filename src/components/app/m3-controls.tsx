"use client";

import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics";
import { useState } from "react";
import { ctaClass, secondaryClass } from "@/components/brand/primitives";
import { inputClass, labelClass } from "./ui";

const smallBtn = "cursor-pointer rounded-[8px] border border-border-strong bg-transparent px-[10px] py-[5px] text-[13px] font-medium text-fg hover:bg-line disabled:opacity-50";

/** Pause / resume / delete for one schedule row. */
export function ScheduleActions({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const call = async (method: "PATCH" | "DELETE", body?: object) => {
    setBusy(true);
    await fetch(`/api/schedules/${id}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    setBusy(false);
    router.refresh();
  };
  return (
    <span className="flex gap-2">
      <button type="button" disabled={busy} className={smallBtn} onClick={() => call("PATCH", { active: !active })}>{active ? "Pause" : "Resume"}</button>
      <button type="button" disabled={busy} className={`${smallBtn} border-danger/50 text-danger`} onClick={() => call("DELETE")}>Delete</button>
    </span>
  );
}

/** The business's live share link: create, copy, regenerate, revoke. */
export function ShareLinkCard({ businessId, slug, origin, locked }: { businessId: string; slug: string | null; origin: string; locked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = slug ? `${origin}/r/${slug}` : null;

  const call = async (method: "POST" | "DELETE") => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/businesses/${businessId}/share`, { method });
    setBusy(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { message?: string };
      return setError(json.message ?? "That did not work. Try again.");
    }
    router.refresh();
  };

  if (!url) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="m-0 max-w-[620px] text-[15px] leading-normal text-muted-foreground">
          A live link your client can open without an account. It always shows the latest scans and audit for this business, under your branding.
        </p>
        <button type="button" disabled={busy || locked} className={ctaClass("sm", "cursor-pointer border-0")} onClick={() => call("POST")}>
          <span>{busy ? "Creating…" : locked ? "Needs lifetime access" : "Create share link"}</span>
        </button>
        {error ? <p role="alert" className="m-0 text-[14px] text-danger">{error}</p> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-[10px]">
        <a href={url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-[1_1_260px] truncate rounded-[10px] border border-border-strong bg-inset px-[14px] py-[10px] font-mono text-[14px] text-fg no-underline hover:underline">
          {url.replace(/^https?:\/\//, "")}
        </a>
        <button
          type="button"
          className={`shrink-0 cursor-pointer rounded-[10px] border-0 px-5 py-[10px] text-[15px] font-semibold transition-colors ${copied ? "bg-copied text-white" : "bg-fg text-bg"}`}
          onClick={() => {
            void navigator.clipboard?.writeText(url).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
        >
          {copied ? "✓ Copied" : "Copy link"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-dim">
        <a href={`/api/reports/${slug}/pdf`} download className={`${smallBtn} no-underline`} onClick={() => track("pdf_downloaded", { kind: "share" })}>Download PDF</a>
        <button type="button" disabled={busy} className={smallBtn} onClick={() => call("POST")}>Regenerate</button>
        <button type="button" disabled={busy} className={`${smallBtn} border-danger/50 text-danger`} onClick={() => call("DELETE")}>Revoke</button>
        <span>Regenerating or revoking makes the current link stop working. Share links are never indexed by search engines.</span>
      </div>
      {error ? <p role="alert" className="m-0 text-[14px] text-danger">{error}</p> : null}
    </div>
  );
}

export interface BrandValues {
  brand_name: string;
  brand_color_hex: string;
  brand_website: string;
  reply_to_email: string;
  hide_rankbyai_branding: boolean;
  logoUrl: string | null;
}

/** White-label settings (brief 7.6). */
export function BrandingForm({ initial, canEdit }: { initial: BrandValues; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [color, setColor] = useState(initial.brand_color_hex || "#f5f5f5");
  const [useColor, setUseColor] = useState(!!initial.brand_color_hex);

  const save = async (form: FormData) => {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/branding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand_name: form.get("brand_name"), brand_color_hex: useColor ? color : null, brand_website: form.get("brand_website"),
        reply_to_email: form.get("reply_to_email"), hide_rankbyai_branding: form.get("hide") === "on",
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { message?: string };
    setBusy(false);
    setMsg({ ok: res.ok, text: res.ok ? "Branding saved. Share links use it right away." : (json.message ?? "Branding could not be saved.") });
    if (res.ok) router.refresh();
  };

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("logo", file);
    const res = await fetch("/api/branding/logo", { method: "POST", body: fd });
    const json = (await res.json().catch(() => ({}))) as { message?: string };
    setBusy(false);
    setMsg({ ok: res.ok, text: res.ok ? "Logo uploaded." : (json.message ?? "The logo could not be uploaded.") });
    if (res.ok) router.refresh();
  };

  const clearLogo = async () => {
    setBusy(true);
    await fetch("/api/branding/logo", { method: "DELETE" });
    setBusy(false);
    router.refresh();
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
      <form action={save} className="flex flex-col gap-5">
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Agency name</span>
          <input name="brand_name" defaultValue={initial.brand_name} maxLength={80} placeholder="Acme Local Marketing" className={inputClass} disabled={!canEdit} />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Website</span>
          <input name="brand_website" type="url" defaultValue={initial.brand_website} maxLength={300} placeholder="https://youragency.com" className={inputClass} disabled={!canEdit} />
          <span className="text-[13px] text-dim">Reports end with “Get this fixed by {"{agency}"}” linking here.</span>
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Reply-to email</span>
          <input name="reply_to_email" type="email" defaultValue={initial.reply_to_email} maxLength={254} placeholder="hello@youragency.com" className={inputClass} disabled={!canEdit} />
        </label>
        <div className="flex flex-col gap-[6px]">
          <span className={labelClass}>Accent color</span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[14px] text-muted-foreground">
              <input type="checkbox" checked={useColor} onChange={(e) => setUseColor(e.target.checked)} className="size-4 accent-[var(--rb-fg)]" disabled={!canEdit} /> Use my color
            </label>
            <input type="color" aria-label="Accent color" value={color} onChange={(e) => setColor(e.target.value)} disabled={!canEdit || !useColor} className="h-9 w-14 cursor-pointer rounded-md border border-border-strong bg-inset" />
            <span className="font-mono text-[13px] text-dim">{useColor ? color : "default"}</span>
          </div>
        </div>
        <label className="flex items-start gap-3 text-[14px] leading-normal text-muted-foreground">
          <input type="checkbox" name="hide" defaultChecked={initial.hide_rankbyai_branding} className="mt-1 size-4 accent-[var(--rb-fg)]" disabled={!canEdit} />
          <span>Hide RankbyAI branding on reports. The badge becomes “Data: Google Maps + AI assistants, {"{date}"}”.</span>
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy || !canEdit} className={ctaClass("sm", "cursor-pointer border-0")}><span>{busy ? "Saving…" : "Save branding"}</span></button>
          {msg ? <span role={msg.ok ? "status" : "alert"} className={`text-[14px] ${msg.ok ? "text-g1" : "text-danger"}`}>{msg.text}</span> : null}
        </div>
      </form>

      <div className="flex h-fit flex-col gap-4 rounded-2xl border border-border bg-inset p-5">
        <span className={labelClass}>Logo</span>
        <div className="grid h-[96px] place-items-center rounded-xl border border-dashed border-border-strong bg-bg">
          {initial.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={initial.logoUrl} alt="Your logo" className="max-h-[64px] max-w-[80%]" />
          ) : (
            <span className="text-[13px] text-dim">No logo yet</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className={secondaryClass(`cursor-pointer ${!canEdit ? "pointer-events-none opacity-50" : ""}`)}>
            Upload logo
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={!canEdit || busy} onChange={(e) => uploadLogo(e.target.files?.[0])} />
          </label>
          {initial.logoUrl ? <button type="button" disabled={busy || !canEdit} className={secondaryClass("cursor-pointer bg-transparent")} onClick={clearLogo}>Remove</button> : null}
        </div>
        <p className="m-0 text-[13px] leading-normal text-dim">PNG, JPEG or WebP, up to 512 KB. Reports have a dark background, so use a light or transparent-background logo.</p>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ctaClass } from "@/components/brand/primitives";
import { LANGUAGE_OPTIONS, businessLanguage, languageName } from "@/lib/countries";
import { hasQuestionIn } from "@/lib/scans/prompt";
import { SERVICE_AREA_NOTE } from "@/lib/service-area";
import type { Pt } from "./centre-map";
import { CentrePicker } from "./centre-picker";
import { inputClass, labelClass } from "./ui";

/** Correct a business's map point and choose the language of text written for it. */
export function BusinessDetails({ id, location, serviceArea, language, askInLanguage, country, countryLanguage }: {
  id: string;
  location: Pt | null;
  serviceArea: boolean;
  /** The business's own language setting (null = its country's language). */
  language: string | null;
  /** Whether AI assistants are asked in that language instead of English. */
  askInLanguage: boolean;
  country: string | null;
  /** English name of the country's language, for the default option. */
  countryLanguage: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Pt | null>(null);
  const [busy, setBusy] = useState<"location" | "language" | null>(null);
  const effective = businessLanguage({ language, country });
  const effectiveName = languageName(effective) ?? "English";
  const canAsk = effective.split("-")[0] !== "en" && hasQuestionIn(effective);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const patch = async (body: Record<string, unknown>, what: "location" | "language") => {
    setBusy(what);
    setMsg(null);
    const res = await fetch(`/api/businesses/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { following?: number | null; message?: string }) : {};
    setBusy(null);
    if (!res?.ok) return setMsg({ ok: false, text: json.message ?? "That could not be saved." });
    if (what === "location") {
      const n = json.following ?? 0;
      setMsg({ ok: true, text: `Location saved.${n ? ` ${n} ${n === 1 ? "schedule uses" : "schedules use"} it from the next run.` : ""} Earlier scans keep the point they ran on.` });
      setDraft(null);
    } else setMsg({ ok: true, text: "Language saved." });
    router.refresh();
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        <span className={labelClass}>Map location</span>
        {serviceArea ? <p className="m-0 text-[13px] text-amber">{SERVICE_AREA_NOTE}</p> : null}
        <p className="m-0 text-[13px] text-dim">Where grids are centred by default. If the pin is in the wrong place, move it here: schedules that use the business&apos;s location follow it.</p>
        <CentrePicker mode="pin" value={draft} business={location} radiusMiles={0.6} country={country} onChange={setDraft} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!draft || busy !== null} onClick={() => draft && patch({ lat: draft.lat, lng: draft.lng }, "location")} className={ctaClass("sm", "cursor-pointer border-0")}>
            <span>{busy === "location" ? "Saving…" : "Save location"}</span>
          </button>
          {draft ? <button type="button" onClick={() => setDraft(null)} className="cursor-pointer border-0 bg-transparent text-[13.5px] text-muted-foreground underline underline-offset-2">Undo</button> : null}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Language</span>
          <select
            value={language ?? ""}
            disabled={busy !== null}
            onChange={(e) => patch({ language: e.target.value || null }, "language")}
            className={inputClass}
          >
            <option value="">{countryLanguage} (the country&apos;s language)</option>
            {LANGUAGE_OPTIONS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
          <span className="text-[13px] text-dim">Text written for this business, such as its Fix Kit and the fix prompt in its reports, is in this language. Reports themselves stay in English.</span>
        </label>
        {canAsk ? (
          <label className="flex items-start gap-3 text-[14px] leading-normal text-muted-foreground">
            <input type="checkbox" checked={askInLanguage} disabled={busy !== null} onChange={(e) => patch({ ask_in_language: e.target.checked }, "language")} className="mt-1 size-4 accent-[var(--rb-fg)]" />
            <span>
              Ask AI assistants in {effectiveName}. <span className="text-dim">Recommended: customers ask in their own language, and the answers and the sites cited differ. The first AI check after a change asks a different question, so it does not compare point by point with earlier ones.</span>
            </span>
          </label>
        ) : effective.split("-")[0] !== "en" ? (
          <p className="m-0 text-[13px] text-dim">AI assistants are asked in English: RankbyAI has no written question in {effectiveName} yet.</p>
        ) : null}
        {msg ? <p role={msg.ok ? "status" : "alert"} className={`m-0 text-[14px] ${msg.ok ? "text-g1" : "text-danger"}`}>{msg.text}</p> : null}
      </div>
    </div>
  );
}

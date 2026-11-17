"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ctaClass, secondaryClass } from "@/components/brand/primitives";
import { DATAFORSEO_MAPS_PER_POINT } from "@/lib/pricing-constants";
import { inputClass, labelClass } from "./ui";

interface Listing {
  name: string;
  cid: string | null;
  placeId: string | null;
  domain: string | null;
  url: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  category: string | null;
  rating: number | null;
  reviews: number | null;
}

/** Search a Google listing by name, confirm it, save it. One live Maps lookup on the user's DataForSEO key. */
export function AddBusiness({ disabled, disabledReason }: { disabled?: boolean; disabledReason?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const search = async (form: FormData) => {
    setBusy(true);
    setError(null);
    setResults(null);
    const params = new URLSearchParams({ q: String(form.get("q") ?? ""), city: String(form.get("city") ?? ""), country: String(form.get("country") ?? "US") });
    const res = await fetch(`/api/businesses/search?${params}`);
    const json = (await res.json().catch(() => ({}))) as { results?: Listing[]; message?: string };
    setBusy(false);
    if (!res.ok) return setError(json.message ?? "The search failed.");
    setResults(json.results ?? []);
  };

  const add = async (l: Listing) => {
    if (l.lat == null || l.lng == null) return setError("This listing has no map location, so a grid cannot be centred on it.");
    setAdding(l.cid ?? l.name);
    setError(null);
    const res = await fetch("/api/businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: l.name, cid: l.cid, place_id: l.placeId, address: l.address, city: l.city, region: l.region, country: l.country,
        lat: l.lat, lng: l.lng, website: l.url ?? (l.domain ? `https://${l.domain}` : null), phone: l.phone,
        primary_category: l.category, rating: l.rating, reviews_count: l.reviews,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    setAdding(null);
    if (!res.ok || !json.id) return setError(json.message ?? "The business could not be saved.");
    router.push(`/app/businesses/${json.id}`);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <form action={search} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[2fr_1.4fr_auto_auto]">
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Business name</span>
          <input name="q" required minLength={2} maxLength={120} placeholder="Northgate Family Dental" className={inputClass} disabled={disabled} />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>City</span>
          <input name="city" maxLength={120} placeholder="Austin, TX" className={inputClass} disabled={disabled} />
        </label>
        <label className="flex flex-col gap-[6px]">
          <span className={labelClass}>Country</span>
          <select name="country" defaultValue="US" className={inputClass} disabled={disabled}>
            <option value="US">United States</option>
            <option value="GB">United Kingdom</option>
            <option value="CA">Canada</option>
            <option value="AU">Australia</option>
            <option value="IE">Ireland</option>
            <option value="NZ">New Zealand</option>
          </select>
        </label>
        <button type="submit" disabled={disabled || busy} className={ctaClass("sm", "h-[42px] cursor-pointer justify-center border-0")}>
          <span>{busy ? "Searching…" : "Search"}</span>
        </button>
      </form>
      <p className="m-0 text-[13px] text-dim">
        {disabled ? disabledReason : `One live Google Maps lookup on your DataForSEO key: $${DATAFORSEO_MAPS_PER_POINT.live.toFixed(3)} per search.`}
      </p>
      {error ? <p role="alert" className="m-0 text-[14px] text-danger">{error}</p> : null}
      {results ? (
        results.length === 0 ? (
          <p className="m-0 text-[15px] text-muted-foreground">No listing found. Try the exact name from Google Maps, plus the city.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Search results">
            {results.map((l) => (
              <li key={(l.cid ?? l.name) + (l.address ?? "")} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-inset px-4 py-3">
                <span className="flex min-w-0 flex-col gap-[2px]">
                  <span className="text-[15px] font-medium">{l.name}</span>
                  <span className="truncate text-[13px] text-dim">
                    {[l.address, l.category, l.rating != null ? `${l.rating}★ (${l.reviews ?? 0})` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <button type="button" disabled={adding !== null} onClick={() => add(l)} className={secondaryClass("cursor-pointer bg-transparent")}>
                  {adding === (l.cid ?? l.name) ? "Adding…" : "This is it"}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

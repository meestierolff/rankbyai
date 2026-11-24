"use client";
import { useState } from "react";
import Link from "next/link";
import { COUNTRIES, cityPath, type Country, type IndexCity } from "@/lib/ai-index/model";

/** All rows are server-rendered; filtering enhances the same table after hydration. */
export function Cities({ cities }: { cities: IndexCity[] }) {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [status, setStatus] = useState("");
  const filtered = cities.filter(city => (!country || country === city.country) && (!status || (status === "parsed" ? city.status === "parsed" : city.status !== "parsed")) && `${city.city} ${city.agencies.map(a => a.name).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <div className="index-filters">
      <label>City or agency<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search this snapshot" /></label>
      <label>Country<select value={country} onChange={event => setCountry(event.target.value)}><option value="">All countries</option>{Object.entries(COUNTRIES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
      <label>Parse status<select value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option><option value="parsed">Parsed shortlist</option><option value="unparseable">Unparseable</option></select></label>
    </div>
    <p role="status" className="index-note">{filtered.length} of {cities.length} cities shown</p>
    {filtered.length === 0 ? <p>No cities match these filters.</p> : null}
    <div className="index-table-scroll" tabIndex={0} role="region" aria-label="City snapshot table">
      <table><caption>23 November 2026 · One ChatGPT run per city. Order of names is not a ranking.</caption><thead><tr><th scope="col">Country</th><th scope="col">City</th><th scope="col">Parse status</th><th scope="col">Names</th><th scope="col">Name at the start of this run</th></tr></thead>
        {(Object.keys(COUNTRIES) as Country[]).map(code => <tbody key={code} id={code}>{filtered.filter(city => city.country === code).map(city => <tr key={cityPath(city)}><td>{COUNTRIES[code]}</td><th scope="row"><Link href={cityPath(city)} prefetch={false}>{city.city}</Link></th><td>{city.status === "parsed" ? "Parsed shortlist" : `Unparseable: ${city.reason}`}</td><td className="index-number">{city.status === "parsed" ? city.agencies.length : "—"}</td><td>{city.status === "parsed" ? city.agencies[0]?.name : "—"}</td></tr>)}</tbody>)}
      </table>
    </div>
  </>;
}

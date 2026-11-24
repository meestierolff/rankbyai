#!/usr/bin/env python3
"""Compute SEO Agency AI Index findings from data/index-2026-11.csv only.

Every number printed here is reproducible from the CSV. No other inputs.
Usage: python3 analyze.py
"""
from __future__ import annotations

import csv
import json
import re
import statistics
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
CSV_PATH = HERE.parent / "data/ai-index/index-2026-11.csv"

# Directory / listicle domains we measure as "cited sources", not agency sites.
DIRECTORY_GROUPS = {
    "Clutch": {"clutch.co"},
    "Expertise.com": {"expertise.com"},
    "The Manifest": {"themanifest.com"},
    "UpCity": {"upcity.com"},
    "DesignRush": {"designrush.com"},
    "Semrush Agency Directory": {"agencies.semrush.com", "semrush.com"},
    "GoodFirms": {"goodfirms.co", "goodfirms.com"},
    "Sortlist": {"sortlist.com", "sortlist.co.uk"},
    "TopSEOs": {"topseos.com"},
}

# Broader "agency directory / listicle" set used for the combined share.
DIRECTORY_BROAD = set().union(*DIRECTORY_GROUPS.values()) | {
    "thefractionalseo.com",
    "bestprosintown.com",
    "trustanalytica.org",
    "agencies.nz",
    "agencylist.com",
    "localdigital.com.au",
    "clearbrief.com.au",
    "agencyecho.com.au",
    "starworks.com.au",
    "mnagencyindex.com",
    "semverified.com",
    "wordofmouth.com.au",
    "onfolio.com",
    "reverbico.com",
    "bbb.org",
    "direct-1st.com",
    "newyorkdigitalmarketingagencies.com",
    "threebestrated.com",
    "threebestrated.co.uk",
}


def norm_name(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "")
    s = s.replace("&amp;", "&").lower()
    s = re.sub(r"[^a-z0-9&]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(
        r"\b(incorporated|inc|llc|l l c|ltd|limited|llp|co|company|plc|pty|gmbh)\b",
        "",
        s,
    )
    s = re.sub(r"\s+", " ", s).strip()
    return s


def registrable(domain: str) -> str:
    d = (domain or "").lower().strip()
    if d.startswith("www."):
        d = d[4:]
    return d


def pct(n: int, d: int, digits: int = 1) -> str:
    if d == 0:
        return "n/a"
    return f"{100 * n / d:.{digits}f}%"


def load_rows() -> list[dict]:
    rows = []
    with CSV_PATH.open(encoding="utf-8") as f:
        for raw in csv.DictReader(f):
            raw["n_agencies"] = int(raw["n_agencies"])
            raw["n_sources"] = int(raw["n_sources"])
            raw["agencies"] = json.loads(raw["agencies_json"] or "[]")
            raw["sources"] = json.loads(raw["sources_json"] or "[]")
            raw["source_domain_list"] = [
                registrable(d) for d in (raw.get("source_domains") or "").split("|") if d
            ]
            rows.append(raw)
    return rows


def main() -> None:
    rows = load_rows()
    parsed = [r for r in rows if r["parse_status"] == "parsed"]
    failed = [r for r in rows if r["parse_status"] != "parsed"]

    print(f"CSV: {CSV_PATH}")
    print(f"Rows (cities): {len(rows)}")
    print(f"Parsed: {len(parsed)}")
    print(f"Unparseable: {len(failed)}")
    print()

    # Dates / model / query
    dates = Counter(r["date_collected_utc"] for r in rows)
    models = Counter(r["model"] for r in rows)
    queries = Counter(r["query"].startswith("best SEO agency in ") for r in rows)
    print("Dates (UTC date):", dict(dates))
    print("Models:", dict(models))
    print("Queries starting with 'best SEO agency in ':", queries[True], "/", len(rows))
    print()

    # Country coverage
    print("## Coverage by country")
    for c in ("US", "UK", "AU", "NZ"):
        sub = [r for r in rows if r["country"] == c]
        p = [r for r in sub if r["parse_status"] == "parsed"]
        print(f"  {c}: {len(sub)} cities, {len(p)} parsed, {len(sub)-len(p)} unparseable")
    print()

    print("## Unparseable reasons")
    reasons = Counter(r["parse_notes"] for r in failed)
    for reason, n in reasons.most_common():
        print(f"  {n}: {reason}")
        names = [f"{r['country']}/{r['city']}" for r in failed if r["parse_notes"] == reason]
        print("    " + ", ".join(names))
    print()

    # List lengths
    lengths = [r["n_agencies"] for r in parsed]
    print("## Agencies named per parsed answer")
    print(f"  n = {len(lengths)}")
    print(f"  mean = {statistics.mean(lengths):.2f}")
    print(f"  median = {statistics.median(lengths):.1f}")
    print(f"  min = {min(lengths)}, max = {max(lengths)}")
    dist = Counter(lengths)
    print("  distribution:", dict(sorted(dist.items())))
    print()

    print("## Agencies named per parsed answer, by country")
    for c in ("US", "UK", "AU", "NZ"):
        sub = [r["n_agencies"] for r in parsed if r["country"] == c]
        if not sub:
            continue
        print(
            f"  {c}: n={len(sub)} mean={statistics.mean(sub):.2f} "
            f"median={statistics.median(sub):.1f} min={min(sub)} max={max(sub)}"
        )
    print()

    # Mentions and unique agencies
    mentions = []  # dicts
    for r in parsed:
        for a in r["agencies"]:
            mentions.append({
                "country": r["country"],
                "city": r["city"],
                "position": a["position"],
                "name": a["name"],
                "name_norm": norm_name(a["name"]),
                "domain": registrable(a.get("domain") or ""),
            })
    print(f"## Agency mentions (parsed cities only): {len(mentions)}")
    with_dom = sum(1 for m in mentions if m["domain"])
    print(f"  with a domain: {with_dom} ({pct(with_dom, len(mentions))})")
    unique_names = sorted({m["name_norm"] for m in mentions if m["name_norm"]})
    print(f"  unique normalised names: {len(unique_names)}")
    unique_domains = sorted({m["domain"] for m in mentions if m["domain"]})
    print(f"  unique domains (where given): {len(unique_domains)}")
    print()

    # Multi-city by normalised name
    cities_by_name = defaultdict(set)
    countries_by_name = defaultdict(set)
    display_by_name = defaultdict(Counter)
    city_list_by_name = defaultdict(list)
    for m in mentions:
        key = m["name_norm"]
        cities_by_name[key].add((m["country"], m["city"]))
        countries_by_name[key].add(m["country"])
        display_by_name[key][m["name"]] += 1
        city_list_by_name[key].append(f"{m['country']}/{m['city']}")

    def display_name(key: str) -> str:
        return display_by_name[key].most_common(1)[0][0]

    multi = {k: v for k, v in cities_by_name.items() if len(v) >= 2}
    print("## Agencies named in more than one city (normalised name)")
    print(f"  unique names in 2+ cities: {len(multi)} / {len(unique_names)} ({pct(len(multi), len(unique_names))})")
    for thresh in (3, 5, 10):
        n = sum(1 for v in cities_by_name.values() if len(v) >= thresh)
        print(f"  unique names in {thresh}+ cities: {n}")
    mentions_multi = sum(1 for m in mentions if len(cities_by_name[m["name_norm"]]) >= 2)
    print(
        f"  mentions that belong to a 2+-city name: {mentions_multi} / {len(mentions)} "
        f"({pct(mentions_multi, len(mentions))})"
    )
    single_names = sum(1 for v in cities_by_name.values() if len(v) == 1)
    print(
        f"  unique names in exactly 1 city: {single_names} / {len(unique_names)} "
        f"({pct(single_names, len(unique_names))})"
    )
    # Multi-country names
    multi_country = {k: v for k, v in countries_by_name.items() if len(v) >= 2}
    print(f"  unique names appearing in 2+ countries: {len(multi_country)}")
    for k, countries in sorted(multi_country.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        print(f"    {display_name(k)}: {', '.join(sorted(countries))} — cities: {', '.join(city_list_by_name[k])}")
    print()

    print("  Top names by number of cities (all 3+):")
    ranked = sorted(cities_by_name.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    for k, cities in ranked:
        if len(cities) < 3:
            continue
        countries = ",".join(sorted(countries_by_name[k]))
        city_str = ", ".join(sorted(f"{c}/{n}" for c, n in cities))
        print(f"    {len(cities):3d} cities ({countries})  {display_name(k)}  [{city_str}]")
    print()

    # Same-domain multi-city (where domain was captured)
    cities_by_domain = defaultdict(set)
    name_by_domain = defaultdict(Counter)
    for m in mentions:
        if not m["domain"]:
            continue
        cities_by_domain[m["domain"]].add((m["country"], m["city"]))
        name_by_domain[m["domain"]][m["name"]] += 1
    multi_dom = {d: v for d, v in cities_by_domain.items() if len(v) >= 2}
    print("## Agencies with the same captured domain in 2+ cities")
    print(f"  domains in 2+ cities: {len(multi_dom)} / {len(unique_domains)}")
    for d, cities in sorted(multi_dom.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        if len(cities) < 3:
            continue
        label = name_by_domain[d].most_common(1)[0][0]
        city_str = ", ".join(sorted(f"{c}/{n}" for c, n in cities))
        print(f"    {len(cities):3d}  {label} ({d})  [{city_str}]")
    print()

    # Position 1 repeats
    firsts = [m for m in mentions if m["position"] == 1]
    first_names = Counter(m["name_norm"] for m in firsts)
    print("## Position-1 names appearing more than once")
    repeats = [(k, n) for k, n in first_names.most_common() if n >= 2]
    print(f"  distinct #1 names: {len(first_names)}; names that are #1 in 2+ cities: {len(repeats)}")
    for k, n in repeats[:25]:
        print(f"    {n:3d}  {display_name(k)}")
    print()

    # Sources
    with_sources = [r for r in rows if r["n_sources"] > 0]
    parsed_with_sources = [r for r in parsed if r["n_sources"] > 0]
    print("## Cited sources")
    print(f"  cities with at least one cited source: {len(with_sources)} / {len(rows)} ({pct(len(with_sources), len(rows))})")
    print(f"  parsed cities with at least one cited source: {len(parsed_with_sources)} / {len(parsed)} ({pct(len(parsed_with_sources), len(parsed))})")
    src_counts = [r["n_sources"] for r in rows]
    print(
        f"  sources per city (all 387): mean={statistics.mean(src_counts):.2f} "
        f"median={statistics.median(src_counts):.1f} min={min(src_counts)} max={max(src_counts)}"
    )
    # Domain frequencies among cited sources
    src_doms = Counter()
    for r in rows:
        for d in r["source_domain_list"]:
            src_doms[d] += 1
    print("  Top cited source domains (city counts):")
    for d, n in src_doms.most_common(20):
        print(f"    {n:3d}  {d}  ({pct(n, len(rows))} of all cities)")
    print()

    print("## Share of answers citing named directories (all 387 cities)")
    # A city cites a group if any source domain matches, including subdomains.
    def cites(row: dict, roots: set[str]) -> bool:
        for d in row["source_domain_list"]:
            for root in roots:
                if d == root or d.endswith("." + root):
                    return True
        return False

    any_named = 0
    any_broad = 0
    for r in rows:
        hit_named = False
        for label, roots in DIRECTORY_GROUPS.items():
            if cites(r, roots):
                hit_named = True
        if hit_named:
            any_named += 1
        if cites(r, DIRECTORY_BROAD):
            any_broad += 1
    # per group
    for label, roots in DIRECTORY_GROUPS.items():
        n = sum(1 for r in rows if cites(r, roots))
        print(f"  {label}: {n} / {len(rows)} ({pct(n, len(rows))})")
    print(
        f"  Any of Clutch/Expertise/The Manifest/UpCity/DesignRush/Semrush directory/GoodFirms/Sortlist/TopSEOs: "
        f"{any_named} / {len(rows)} ({pct(any_named, len(rows))})"
    )
    print(
        f"  Any of the broader directory/listicle set (see analyze.py DIRECTORY_BROAD): "
        f"{any_broad} / {len(rows)} ({pct(any_broad, len(rows))})"
    )
    print()

    print("## Directory citations by country (all cities in that country)")
    for c in ("US", "UK", "AU", "NZ"):
        sub = [r for r in rows if r["country"] == c]
        n_named = sum(
            1
            for r in sub
            if any(cites(r, roots) for roots in DIRECTORY_GROUPS.values())
        )
        # clutch / expertise specifically
        clutch = sum(1 for r in sub if cites(r, DIRECTORY_GROUPS["Clutch"]))
        expertise = sum(1 for r in sub if cites(r, DIRECTORY_GROUPS["Expertise.com"]))
        manifest = sum(1 for r in sub if cites(r, DIRECTORY_GROUPS["The Manifest"]))
        print(
            f"  {c}: any named directory {n_named}/{len(sub)} ({pct(n_named, len(sub))}); "
            f"Clutch {clutch}/{len(sub)} ({pct(clutch, len(sub))}); "
            f"Expertise {expertise}/{len(sub)} ({pct(expertise, len(sub))}); "
            f"The Manifest {manifest}/{len(sub)} ({pct(manifest, len(sub))})"
        )
    print()

    print("## Australia local listicles (AU cities only)")
    au = [r for r in rows if r["country"] == "AU"]
    au_local = {
        "starworks.com.au",
        "localdigital.com.au",
        "clearbrief.com.au",
        "agencyecho.com.au",
        "wordofmouth.com.au",
        "pwd.com.au",
    }
    au_any = sum(1 for r in au if cites(r, au_local))
    print(
        f"  Any of starworks/localdigital/clearbrief/agencyecho/wordofmouth/pwd: "
        f"{au_any} / {len(au)} ({pct(au_any, len(au))})"
    )
    for root in sorted(au_local):
        n = sum(1 for r in au if cites(r, {root}))
        print(f"  {root}: {n} / {len(au)} ({pct(n, len(au))})")
    print()

    # Raw-dfs vs markdown-only sources
    origin = Counter(r["sources_origin"] or "(none)" for r in rows)
    print("## Source origin")
    for k, n in origin.most_common():
        print(f"  {n}: {k}")
    print()

    # Parsed vs unparseable still have sources
    failed_with = sum(1 for r in failed if r["n_sources"] > 0)
    print(f"Unparseable cities that still have cited sources: {failed_with} / {len(failed)}")
    print()
    print("Done.")


if __name__ == "__main__":
    main()

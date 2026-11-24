#!/usr/bin/env python3
"""Import the existing snapshot. No network or paid calls. Never invent missing fields."""
import sys
sys.dont_write_bytecode = True

import argparse
import csv
import json
import re
import statistics
from collections import defaultdict
from importlib.util import spec_from_file_location, module_from_spec
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = spec_from_file_location("source_analysis", ROOT / "scripts/analyze-ai-index.py")
analysis = module_from_spec(spec)
spec.loader.exec_module(analysis)
REASONS = {
    "ambiguous_city_unresolved": "ChatGPT asked which {city} we meant and did not give a usable shortlist.",
    "clarifying_question_no_agencies": "ChatGPT replied with a clarifying question and named no agencies.",
    "wrong_country": "ChatGPT answered for a different {city} in another country, so we left the answer out.",
    "ambiguous_multiple_cities": "ChatGPT gave lists for several places with this name, so we left the answer out.",
}
COUNTRIES = {"us": "us", "usa": "us", "united states": "us", "uk": "uk", "gb": "uk", "united kingdom": "uk", "au": "au", "australia": "au", "nz": "nz", "new zealand": "nz"}

def field(row, *names, optional=False):
    for name in names:
        if name in row:
            return row[name].strip()
    if optional:
        return ""
    raise ValueError(f"Missing column; expected one of {names}. Actual columns: {list(row)}")

def import_rows(path):
    cities = []
    with path.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            name = field(row, "city", "city_name")
            country = COUNTRIES[field(row, "country", "country_code").lower()]
            status = field(row, "parse_status")
            slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
            query = field(row, "query", "prompt")
            agencies = []
            notes = field(row, "parse_notes")
            reason = "" if status == "parsed" else REASONS[notes].format(city=name)
            if status == "parsed":
                raw_agencies = json.loads(field(row, "agencies_json", "names_json", "shortlist_json"))
                for agency in raw_agencies:
                    # Require the recorded position, rather than assigning a guessed order.
                    agencies.append({"position": int(agency["position"]), "name": agency["name"], "domain": agency.get("domain") or ""})
                positions = [a["position"] for a in agencies]
                assert all(p > 0 for p in positions) and positions == sorted(set(positions)), f"Invalid positions: {name}"
                if "n_agencies" in row:
                    assert int(row["n_agencies"]) == len(agencies), f"Agency count mismatch: {name}"
            else:
                if not reason:
                    raise ValueError(f"Missing plain-language reason for {name}: {status}. Read findings.md and map this status explicitly; do not guess.")
            sources = json.loads(field(row, "sources_json"))
            urls = []
            for source in sources:
                if isinstance(source, str):
                    urls.append(source)
                else:
                    value = source.get("url") or source.get("domain")
                    if not value:
                        raise ValueError(f"Unknown citation format: {source}")
                    urls.append(value)
            assert int(field(row, "n_sources")) == len(urls), f"Source count mismatch: {name}"
            cities.append({"country": country, "city": name, "slug": slug, "query": query, "status": status, "reason": reason, "agencies": agencies, "sources": urls, "sourceDetails": sources, "sourceDomains": [analysis.registrable(d) for d in row["source_domains"].split("|") if d], "parseNotes": notes, "model": field(row, "model"), "collectedUtc": field(row, "datetime_collected_utc"), "collectedAmsterdam": field(row, "datetime_collected_europe_amsterdam")})
    assert len(cities) == 387, f"Expected 387 cities, received {len(cities)}"
    assert Counter(c["country"] for c in cities) == Counter(us=273, uk=53, au=54, nz=7), "Country counts differ from brief"
    parsed = [c for c in cities if c["status"] == "parsed"]
    assert len(parsed) == 336, "Expected 336 parsed and 51 unparseable cities"
    assert sum(len(c["agencies"]) for c in parsed) == 1610, "Expected 1,610 names"
    assert sum(len(c["agencies"]) == 5 for c in parsed) == 213, "Expected 213 five-name lists"
    assert sum(bool(c["sources"]) for c in cities) == 325, "Expected 325 answers with citations"
    assert len({(c["country"], c["slug"]) for c in cities}) == 387, "Duplicate country/city URL"
    assert all(c["query"] == f'best SEO agency in {c["city"]}' for c in cities), "Unexpected query"
    return sorted(cities, key=lambda c: (["us", "uk", "au", "nz"].index(c["country"]), c["city"]))

def aggregate(cities):
    parsed = [c for c in cities if c["status"] == "parsed"]
    lengths = [len(c["agencies"]) for c in parsed]
    names = defaultdict(set)
    display = {}
    for c in parsed:
        for agency in c["agencies"]:
            key = analysis.norm_name(agency["name"])
            names[key].add((c["country"], c["city"]))
            display.setdefault(key, agency["name"])
    def cites(city, roots):
        return any(d == root or d.endswith("." + root) for d in city["sourceDomains"] for root in roots)
    roots = set().union(*analysis.DIRECTORY_GROUPS.values())
    au_roots = ["starworks.com.au", "localdigital.com.au", "clearbrief.com.au", "agencyecho.com.au", "wordofmouth.com.au", "pwd.com.au"]
    return {
        "total": len(cities), "parsed": len(parsed), "unparseable": len(cities)-len(parsed),
        "countries": {code: {"total": sum(c["country"] == code for c in cities), "parsed": sum(c["country"] == code for c in parsed), "directories": sum(c["country"] == code and cites(c, roots) for c in cities)} for code in ["us", "uk", "au", "nz"]},
        "reasons": dict(Counter(c["parseNotes"] for c in cities if c["status"] != "parsed")),
        "mentions": sum(lengths), "mean": round(statistics.mean(lengths), 2), "median": statistics.median(lengths), "min": min(lengths), "max": max(lengths), "fiveNames": lengths.count(5),
        "uniqueNames": len([k for k in names if k]), "singleCity": sum(len(v) == 1 for v in names.values()), "multiCity": sum(len(v) >= 2 for v in names.values()), "fiveCities": sum(len(v) >= 5 for v in names.values()), "tenCities": sum(len(v) >= 10 for v in names.values()),
        "widest": [{"name": display[k], "cities": len(v)} for k,v in names.items() if len(v) == max(map(len,names.values()))],
        "withSources": sum(bool(c["sources"]) for c in cities),
        "directories": {label: sum(cites(c, r) for c in cities) for label,r in analysis.DIRECTORY_GROUPS.items()},
        "anyDirectory": sum(cites(c, roots) for c in cities),
        "australianLists": sum(c["country"] == "au" and cites(c, au_roots) for c in cities), "australianDomains": au_roots,
        "parseMethods": dict(Counter(c["parseNotes"].split("method=")[-1] for c in parsed)),
        "withoutAgencyDomain": sum(not a["domain"] for c in parsed for a in c["agencies"]),
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", type=Path)
    args = parser.parse_args()
    rows = import_rows(args.csv)
    target = ROOT / "data/ai-index/index-2026-11.json"
    # Preserve a real publication date when regenerating the same released snapshot.
    previous = json.loads(target.read_text()) if target.exists() else {}
    target.write_text(json.dumps({"publishedAt": previous.get("publishedAt"), "updatedAt": "2026-11-24", "cities": rows}, indent=2, ensure_ascii=False) + "\n")
    (ROOT / "data/ai-index/aggregates-2026-11.json").write_text(json.dumps(aggregate(rows), indent=2, ensure_ascii=False) + "\n")
    print(f"Imported {len(rows)} cities to {target}; publication date remains unset.")

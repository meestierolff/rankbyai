import aggregates from "../../../data/ai-index/aggregates-2026-11.json";
import { COUNTRIES, type Country } from "./model";
export const stats = aggregates;
export const number = (n: number) => n.toLocaleString("en-US");
export const percent = (n: number, total: number) => `${(100 * n / total).toFixed(1)}%`;
const s = stats;
export const coverage = (Object.keys(COUNTRIES) as Country[]).map(code => ({ code, name: COUNTRIES[code], ...s.countries[code] }));
export const coverageLine = coverage.map(c => `${c.name}: ${c.total}`).join(" · ");
export const findings = [
  ["Cities and parse results", `${s.total} cities, one ChatGPT run each on 23 November 2026. ${s.parsed} / ${s.total} (${percent(s.parsed,s.total)}) produced a parseable shortlist; ${s.unparseable} / ${s.total} (${percent(s.unparseable,s.total)}) were unparseable. ${s.countries.us.total-s.countries.us.parsed} / ${s.unparseable} unparseable cities are in the US.`],
  ["Why answers were unparseable", `${s.reasons.ambiguous_city_unresolved} ambiguous and unresolved; ${s.reasons.clarifying_question_no_agencies} clarifying questions with no usable list; ${s.reasons.wrong_country} wrong-country answers; ${s.reasons.ambiguous_multiple_cities} answers with more than one city-specific list (${s.unparseable} total).`],
  ["Names in parsed answers", `${number(s.mentions)} agency mentions across ${s.parsed} parsed answers. Mean ${s.mean.toFixed(2)}, median ${s.median}, range ${s.min}–${s.max} names per answer. ${s.fiveNames} / ${s.parsed} (${percent(s.fiveNames,s.parsed)}) named exactly five agencies.`],
  ["Names across cities", `${number(s.uniqueNames)} unique normalised names. ${number(s.singleCity)} / ${number(s.uniqueNames)} (${percent(s.singleCity,s.uniqueNames)}) appear in one city; ${s.multiCity} / ${number(s.uniqueNames)} (${percent(s.multiCity,s.uniqueNames)}) in two or more; ${s.fiveCities} / ${number(s.uniqueNames)} in five or more; ${s.tenCities} / ${number(s.uniqueNames)} in ten or more.`],
  ["Widest appearances in this snapshot", `${s.widest.map(n=>`${n.name}: ${n.cities} cities`).join("; ")}, in this one run. Many multi-city names are neighbouring suburbs, not national coverage.`],
  ["Answers with sources", `${s.withSources} / ${s.total} answers (${percent(s.withSources,s.total)}) have at least one cited source.`],
  ["Directory citations", `${["Clutch","Expertise.com","The Manifest","UpCity"].map(name=>`${name}: ${s.directories[name as keyof typeof s.directories]} / ${s.total} (${percent(s.directories[name as keyof typeof s.directories],s.total)})`).join("; ")}. At least one of nine major directories: ${s.anyDirectory} / ${s.total} (${percent(s.anyDirectory,s.total)}).`],
  ["United States and Australia", `The nine global directories appear in ${s.countries.us.directories} / ${s.countries.us.total} US answers (${percent(s.countries.us.directories,s.countries.us.total)}) and ${s.countries.au.directories} / ${s.countries.au.total} Australian answers (${percent(s.countries.au.directories,s.countries.au.total)}). At least one Australian list appears in ${s.australianLists} / ${s.countries.au.total} Australian answers (${percent(s.australianLists,s.countries.au.total)}): ${s.australianDomains.join(", ")}.`],
];

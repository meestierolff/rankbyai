#!/usr/bin/env node
/**
 * Builds the country table in src/lib/countries.ts from DataForSEO's own reference lists.
 *
 *   node --env-file=.env.local scripts/gen-countries.mjs fetch <dir>   # 2 GET calls, saves the raw JSON in <dir>
 *   node scripts/gen-countries.mjs build <dir>                         # no network: rewrites the table from <dir>
 *
 * Sources (both say "Your account will not be charged for using this API"):
 *   GET https://api.dataforseo.com/v3/serp/google/locations  https://docs.dataforseo.com/v3/serp/google/locations/
 *   GET https://api.dataforseo.com/v3/serp/google/languages  https://docs.dataforseo.com/v3/serp/google/languages/
 * The Google Maps SERP endpoints take their location_code and language_code from these two lists.
 *
 * Login: HOUSE_DATAFORSEO_LOGIN / HOUSE_DATAFORSEO_PASSWORD from the environment. Nothing here prints or
 * stores them; the saved files hold only the public lists DataForSEO returns.
 *
 * Default language per country: the Unicode CLDR "likely subtags" language for the region (what
 * Intl.Locale("und-XX").maximize() returns), mapped onto DataForSEO's language codes, with English when
 * DataForSEO has no code for it. OVERRIDES below lists the few places where that is not the language
 * Google Maps is mostly searched in, each with its reason.
 * English names: DataForSEO's location_name, with NAME_OVERRIDES for a few spellings.
 * Everything is written out as static strings, so the server and every browser show the same text.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [mode, dir] = process.argv.slice(2);
if (!["fetch", "build"].includes(mode) || !dir) {
  console.error("usage: gen-countries.mjs fetch|build <dir>");
  process.exit(1);
}
const LOCATIONS_FILE = join(dir, "dataforseo-serp-google-locations.json");
const LANGUAGES_FILE = join(dir, "dataforseo-serp-google-languages.json");

if (mode === "fetch") {
  const login = process.env.HOUSE_DATAFORSEO_LOGIN;
  const password = process.env.HOUSE_DATAFORSEO_PASSWORD;
  if (!login || !password) {
    console.error("HOUSE_DATAFORSEO_LOGIN / HOUSE_DATAFORSEO_PASSWORD are not set (run with node --env-file=.env.local).");
    process.exit(1);
  }
  const headers = { Authorization: "Basic " + Buffer.from(`${login}:${password}`).toString("base64") };
  mkdirSync(dir, { recursive: true });
  for (const [path, file] of [["serp/google/locations", LOCATIONS_FILE], ["serp/google/languages", LANGUAGES_FILE]]) {
    const res = await fetch(`https://api.dataforseo.com/v3/${path}`, { headers });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      console.error(`${path}: HTTP ${res.status}, not JSON`);
      process.exit(1);
    }
    const task = body.tasks?.[0];
    // Only status and cost are printed: never the request headers.
    console.log(`${path}: HTTP ${res.status}, status ${body.status_code} ${body.status_message}, cost ${body.cost}, task cost ${task?.cost}, results ${task?.result_count}`);
    writeFileSync(file, text);
  }
  process.exit(0);
}

// ───────────────────────── build ─────────────────────────

const read = (file) => {
  const body = JSON.parse(readFileSync(file, "utf8"));
  if (body.status_code !== 20000 || body.tasks?.[0]?.status_code !== 20000) throw new Error(`${file}: not a successful response`);
  return { result: body.tasks[0].result ?? [], cost: body.cost };
};
const locations = read(LOCATIONS_FILE);
const languages = read(LANGUAGES_FILE);

/** language_code → language_name, exactly as DataForSEO spells them. */
const dfsLanguages = new Map(languages.result.map((l) => [l.language_code, l.language_name]));

/**
 * CLDR language → DataForSEO language_code, where the two spell it differently (DataForSEO has no
 * plain "zh", and calls Norwegian Bokmål "no"). Every result is checked against the fetched list.
 */
const CLDR_TO_DFS = {
  "zh-Hans": "zh-CN",
  "zh-Hant": "zh-TW",
  nb: "no",
};

/**
 * Where the CLDR likely language is not used, in three groups. Not vendor facts; keep the list short.
 * Left on CLDR's pick on purpose (review if listings there turn out to be mostly English or French):
 * TZ sw, MT mt, HK zh-TW, CM fr, SC fr, NE ha. Left on the English fallback: GL (Greenlandic has no code).
 */
const OVERRIDES = {
  // (a) CLDR picks a widely spoken language that is not an official one; use the official language.
  NA: "en", // Afrikaans → English, the only official language
  GH: "en", // Akan → English, the only official language
  SN: "fr", // Wolof → French, the official language
  CC: "en", // Malay → English (Australian territory)
  // (b) CLDR's pick has no DataForSEO code; use another official or working language.
  PY: "es", // Guarani
  CW: "nl", // Papiamentu
  BQ: "nl", // Papiamentu
  CF: "fr", // Sango
  ML: "fr", // Bambara; French is the working language
  // (c) Judgment call: English is an official language and is assumed to be what most Google listings
  // there use, where CLDR picks the most spoken local language.
  IN: "en", PK: "en", PH: "en", KE: "en", UG: "en", ZW: "en", RW: "en", LS: "en",
};

/** DataForSEO's English names, except where it drops the accents or puts "The" first (which breaks type-to-find in a select). */
const NAME_OVERRIDES = {
  BS: "Bahamas",
  GM: "Gambia",
  FK: "Falkland Islands",
  TR: "Türkiye",
  CI: "Côte d'Ivoire",
  CW: "Curaçao",
  RE: "Réunion",
  ST: "São Tomé and Príncipe",
};

/** DataForSEO language names that read oddly in a sentence. */
const LANGUAGE_NAME_OVERRIDES = { ht: "Haitian Creole", to: "Tongan" };

const COMMON = ["US", "GB", "CA", "AU", "IE", "NZ"];

/**
 * Country-level entries: rows without a parent location. Most are typed "Country"; territories with
 * their own ISO code (Hong Kong, Taiwan, Puerto Rico, Macao, ...) are top-level rows typed "Region".
 */
const countries = locations.result
  .filter((l) => l.location_code_parent == null && /^[A-Z]{2}$/.test(l.country_iso_code ?? ""))
  .map((l) => {
    const code = l.country_iso_code;
    let language = "en";
    let languageSource = "fallback";
    if (OVERRIDES[code]) {
      language = OVERRIDES[code];
      languageSource = "override";
    } else {
      const likely = new Intl.Locale(`und-${code}`).maximize();
      const withScript = `${likely.language}-${likely.script}`;
      const candidate = [CLDR_TO_DFS[withScript], withScript, CLDR_TO_DFS[likely.language], likely.language].find((c) => c && dfsLanguages.has(c));
      if (candidate) {
        language = candidate;
        languageSource = "cldr";
      }
    }
    if (!dfsLanguages.has(language)) throw new Error(`${code}: ${language} is not a DataForSEO language code`);
    return { code, locationCode: l.location_code, language, languageSource, name: NAME_OVERRIDES[code] ?? l.location_name, type: l.location_type };
  });

const byCode = new Map();
for (const c of countries) {
  const seen = byCode.get(c.code);
  if (seen && seen.locationCode !== c.locationCode) throw new Error(`${c.code} appears twice with different location codes`);
  byCode.set(c.code, c);
}
const rows = [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
for (const code of COMMON) if (!byCode.has(code)) throw new Error(`${code} is missing from the DataForSEO list`);

const esc = (s) => JSON.stringify(s);
const today = new Date().toISOString().slice(0, 10);
const table = [
  `// Generated by scripts/gen-countries.mjs on ${today} from GET /v3/serp/google/locations (top-level rows: ${rows.filter((r) => r.type === "Country").length} "Country", ${rows.filter((r) => r.type !== "Country").length} "Region")`,
  `// and GET /v3/serp/google/languages (${dfsLanguages.size} languages). Both calls are free. Do not edit by hand: re-run the script.`,
  `// Columns: ISO 3166-1 alpha-2, DataForSEO location_code, default language_code, English name. Sorted by name.`,
  "const TABLE: readonly (readonly [string, number, string, string])[] = [",
  ...rows.map((r) => `  [${esc(r.code)}, ${r.locationCode}, ${esc(r.language)}, ${esc(r.name)}],`),
  "];",
  "// DataForSEO's language_name for each language_code the table uses (two reworded for the UI).",
  "const LANGUAGE_NAMES: Readonly<Record<string, string>> = {",
  ...[...new Set(rows.map((r) => r.language))].sort().map((code) => `  ${esc(code)}: ${esc(LANGUAGE_NAME_OVERRIDES[code] ?? dfsLanguages.get(code))},`),
  "};",
].join("\n");

const target = "src/lib/countries.ts";
const src = readFileSync(target, "utf8");
const BEGIN = "// BEGIN GENERATED COUNTRY TABLE";
const END = "// END GENERATED COUNTRY TABLE";
const a = src.indexOf(BEGIN);
const b = src.indexOf(END);
if (a < 0 || b < a) throw new Error(`${target} has no ${BEGIN} / ${END} markers`);
writeFileSync(target, `${src.slice(0, a + BEGIN.length)}\n${table}\n${src.slice(b)}`);

const nonEnglish = rows.filter((r) => r.language !== "en");
console.log(`${rows.length} countries written to ${target}; ${nonEnglish.length} with a default language other than English.`);
console.log(`English because DataForSEO has no code for the CLDR language: ${rows.filter((r) => r.languageSource === "fallback").map((r) => `${r.code}(${new Intl.Locale(`und-${r.code}`).maximize().language})`).filter((x) => !x.endsWith("(en)")).join(" ") || "none"}`);
console.log(`overrides: ${Object.keys(OVERRIDES).join(" ")}`);
console.log(`not English: ${nonEnglish.map((r) => `${r.code}=${r.language}`).join(" ")}`);

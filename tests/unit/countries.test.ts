import { describe, expect, it } from "vitest";
import {
  COMMON_COUNTRY_CODES, COUNTRIES, COUNTRY_CODES, COUNTRY_OPTION_GROUPS, COUNTRY_OPTIONS,
  countryFromText, countryLanguageNote, countryName, isCountryCode, languageCodeFor, languageNameFor, locationCodeFor, normalizeCountry,
} from "@/lib/countries";
import { countryFromFreeCheckCookie, freeCheckCountryCookie } from "@/lib/free-check";
import { LOCATION_CODES } from "@/lib/providers/dataforseo";

/**
 * language_code values from GET /v3/serp/google/languages (fetched 18 Nov 2026, free call). The table
 * may only use these: DataForSEO rejects any other code.
 */
const DATAFORSEO_LANGUAGES = new Set(
  ("af ak sq am ar hy az ban eu be bn bs bg my ca ceb ny zh-CN zh-TW hr cs da nl en es-419 et ee fo fa fil fi fr fy gaa gl lg ka de el gu ht ha he iw hi hu is bem ig id ga it ja kn kk km rw rn kg ko mfe crs kri ckb ky lo lv ln lt ach mk mg ms ml mt mi mr mn sr-ME ne nso no nyn om ps pcm pl pt pt-BR pt-PT pa qu ro rm ru sr sr-Latn st sn loz sd si sk sl so es sw sv tl tg ta te th ti to lua tn tum tr tk uk ur uz vi cy wo xh yo zu").split(" "),
);

describe("country table", () => {
  it("covers every country-level location DataForSEO lists for Google, each code once", () => {
    expect(COUNTRIES.length).toBe(240);
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRIES.length);
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(Number.isInteger(c.locationCode)).toBe(true);
      expect(c.name.length).toBeGreaterThan(1);
    }
    // Territories without a "Country" row in DataForSEO's list are still there.
    for (const code of ["HK", "TW", "PR", "MO"]) expect(isCountryCode(code)).toBe(true);
    // DataForSEO no longer serves Russia or Belarus.
    expect(isCountryCode("RU")).toBe(false);
    expect(isCountryCode("BY")).toBe(false);
  });

  it("keeps the location codes the six original markets have always used", () => {
    expect(Object.fromEntries(COMMON_COUNTRY_CODES.map((c) => [c, locationCodeFor(c)]))).toEqual({ US: 2840, GB: 2826, CA: 2124, AU: 2036, IE: 2372, NZ: 2554 });
  });

  it("only uses language codes DataForSEO accepts, and English for the original markets", () => {
    for (const c of COUNTRIES) expect(DATAFORSEO_LANGUAGES.has(c.languageCode), `${c.code}: ${c.languageCode}`).toBe(true);
    for (const c of COMMON_COUNTRY_CODES) expect(languageCodeFor(c)).toBe("en");
  });

  it("gives the local language where DataForSEO has one", () => {
    expect(languageCodeFor("DE")).toBe("de");
    expect(languageCodeFor("fr")).toBe("fr");
    expect(languageCodeFor("JP")).toBe("ja");
    expect(languageCodeFor("NL")).toBe("nl");
    expect(languageCodeFor("TW")).toBe("zh-TW");
    expect(languageCodeFor("CN")).toBe("zh-CN");
    expect(languageCodeFor("NO")).toBe("no");
    expect(languageCodeFor("IN")).toBe("en"); // override: English is an official language
    expect(languageCodeFor("SN")).toBe("fr"); // override: CLDR's Wolof is not the official language
    expect(languageCodeFor("PY")).toBe("es"); // override: Guarani has no DataForSEO code
  });

  it("says which language Maps uses next to the country select, and nothing for English", () => {
    expect(countryLanguageNote("DE")).toBe("Google Maps results come in German. AI questions are asked in English.");
    expect(countryLanguageNote("BE")).toBe("Google Maps results come in Dutch. AI questions are asked in English.");
    expect(countryLanguageNote("TW")).toBe("Google Maps results come in Chinese (Traditional). AI questions are asked in English.");
    expect(countryLanguageNote("US")).toBeNull();
    expect(countryLanguageNote("IN")).toBeNull();
    expect(countryLanguageNote(null)).toBeNull();
    for (const c of COUNTRIES) expect(languageNameFor(c.code)).toMatch(/^[A-Z]/);
  });
});

describe("country helpers", () => {
  it("locationCodeFor behaves like the engine's: case-insensitive, unknown or empty means the United States", () => {
    expect(locationCodeFor(undefined)).toBe(2840);
    expect(locationCodeFor(null)).toBe(2840);
    expect(locationCodeFor("gb")).toBe(2826);
    expect(locationCodeFor("ZZ")).toBe(2840);
    expect(locationCodeFor("DE")).toBe(2276);
  });

  it("languageCodeFor falls back to English", () => {
    expect(languageCodeFor(null)).toBe("en");
    expect(languageCodeFor("ZZ")).toBe("en");
  });

  it("isCountryCode is exact; normalizeCountry tidies input", () => {
    expect(isCountryCode("DE")).toBe(true);
    expect(isCountryCode("de")).toBe(false);
    expect(isCountryCode("ZZ")).toBe(false);
    expect(isCountryCode(42)).toBe(false);
    expect(normalizeCountry(" de ")).toBe("DE");
    expect(normalizeCountry("UK")).toBeNull();
    expect(normalizeCountry(null)).toBeNull();
  });

  it("names countries in English", () => {
    expect(countryName("DE")).toBe("Germany");
    expect(countryName("gb")).toBe("United Kingdom");
    expect(countryName("HK")).toBe("Hong Kong");
    expect(countryName("ZZ")).toBeNull();
  });

  it("reads a country the way people write it in a spreadsheet", () => {
    expect(countryFromText("DE")).toBe("DE");
    expect(countryFromText("de")).toBe("DE");
    expect(countryFromText("Germany")).toBe("DE");
    expect(countryFromText("  united kingdom ")).toBe("GB");
    expect(countryFromText("UK")).toBe("GB");
    expect(countryFromText("U.S.A.")).toBe("US");
    expect(countryFromText("Cote d'Ivoire")).toBe("CI");
    expect(countryFromText("Turkey")).toBe("TR");
    expect(countryFromText("Narnia")).toBeNull();
    expect(countryFromText("")).toBeNull();
  });
});

describe("country select options", () => {
  it("lists the common markets first, then every other country A–Z, each once", () => {
    expect(COUNTRY_OPTIONS.slice(0, 6).map((o) => o.value)).toEqual(["US", "GB", "CA", "AU", "IE", "NZ"]);
    expect(COUNTRY_OPTIONS.length).toBe(COUNTRIES.length);
    expect(new Set(COUNTRY_OPTIONS.map((o) => o.value)).size).toBe(COUNTRIES.length);
    const rest = COUNTRY_OPTION_GROUPS[1].options.map((o) => o.label);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, "en")));
    expect(COUNTRY_OPTION_GROUPS[0].options.map((o) => o.label)).toEqual(["United States", "United Kingdom", "Canada", "Australia", "Ireland", "New Zealand"]);
  });
});

describe("free check country", () => {
  const ID = "0b9f3c3e-1d2a-4c4b-9a55-0f6a2b1c7d8e";

  it("carries the chosen country from step 1 to step 2, for that check only", () => {
    const setCookie = freeCheckCountryCookie(ID, "DE", true);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("Path=/api/free-check");
    const sent = `other=1; ${setCookie.split(";")[0]}`;
    expect(countryFromFreeCheckCookie(sent, ID)).toBe("DE");
    expect(countryFromFreeCheckCookie(sent, "another-check")).toBeNull();
    expect(countryFromFreeCheckCookie(null, ID)).toBeNull();
    expect(countryFromFreeCheckCookie(`rbai_fc_country=${ID}.ZZ`, ID)).toBeNull();
    expect(freeCheckCountryCookie(ID, "US", false)).not.toContain("Secure");
  });
});

describe("engine compatibility", () => {
  it("LOCATION_CODES (still imported by the scan engine) matches the table", () => {
    expect(Object.keys(LOCATION_CODES).length).toBe(COUNTRIES.length);
    for (const c of COUNTRIES) expect(LOCATION_CODES[c.code]).toBe(c.locationCode);
  });
});

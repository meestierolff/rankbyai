/**
 * CSV import for prospect mode (brief 7.7). Columns: name, address, city, region, country, website,
 * phone, place_id. Name and city are required. Up to 200 rows.
 */
export const CSV_MAX_ROWS = 200;
export const CSV_COLUMNS = ["name", "address", "city", "region", "country", "website", "phone", "place_id"] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];
export type CsvRow = Record<CsvColumn, string>;

export interface CsvParseResult {
  rows: CsvRow[];
  /** Row numbers are 1-based and count the header as row 1, as a spreadsheet shows them. */
  problems: { row: number; message: string }[];
  error: string | null;
}

/** RFC 4180 parser: quoted fields, doubled quotes, commas and line breaks inside quotes; comma or semicolon separated. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === sep) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      out.push(row); row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim() !== ""));
}

const HEADER_ALIASES: Record<string, CsvColumn> = {
  name: "name", business: "name", "business name": "name", company: "name",
  address: "address", street: "address", city: "city", town: "city",
  region: "region", state: "region", province: "region", country: "country",
  website: "website", url: "website", site: "website", phone: "phone", telephone: "phone", tel: "phone",
  place_id: "place_id", "place id": "place_id", placeid: "place_id",
};

export function parseProspectCsv(text: string): CsvParseResult {
  if (text.length > 1_000_000) return { rows: [], problems: [], error: "The file is larger than 1 MB." };
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], problems: [], error: "The file needs a header row and at least one business." };
  const header = table[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? null);
  if (!header.includes("name") || !header.includes("city")) return { rows: [], problems: [], error: "The header row must contain the columns “name” and “city”." };
  const body = table.slice(1);
  if (body.length > CSV_MAX_ROWS) return { rows: [], problems: [], error: `The file has ${body.length} rows. The limit is ${CSV_MAX_ROWS}.` };

  const rows: CsvRow[] = [];
  const problems: CsvParseResult["problems"] = [];
  body.forEach((cells, i) => {
    const row = Object.fromEntries(CSV_COLUMNS.map((c) => [c, ""])) as CsvRow;
    header.forEach((col, j) => { if (col) row[col] = (cells[j] ?? "").trim().slice(0, 300); });
    if (!row.name || !row.city) problems.push({ row: i + 2, message: !row.name ? "No name." : "No city." });
    else rows.push(row);
  });
  return { rows, problems, error: rows.length ? null : "No row has both a name and a city." };
}

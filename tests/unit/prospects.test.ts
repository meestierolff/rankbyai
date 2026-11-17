import { describe, expect, it } from "vitest";
import { numbersIn } from "@/lib/audit/checks";
import { parseCsv, parseProspectCsv } from "@/lib/prospects/csv";
import { pitchOpener, type OpenerData } from "@/lib/prospects/opener";

const data = (over: Partial<OpenerData> = {}): OpenerData => ({
  business: "Northgate Family Dental", city: "Austin",
  ai: { points: 9, pointsMentioned: 2, topCompetitor: "Smile Dental" },
  maps: { points: 25, top3Points: 6, avgRank: 8.4 },
  reviews: { you: 38, median: 112 },
  ...over,
});

describe("pitch opener", () => {
  it("states the gap in one or two sentences, from the report's numbers only", () => {
    expect(pitchOpener(data())).toBe(
      "At 7 of 9 spots around Austin, AI assistants named Smile Dental and not Northgate Family Dental; it is outside the Google Maps top 3 at 19 of 25 spots. It has 38 reviews against a map-pack median of 112.",
    );
  });

  it("every number in the opener can be derived from the data it was given", () => {
    const d = data();
    const allowed = new Set(["9", "7", "25", "19", "3", "38", "112"]); // 7 = 9 − 2, 19 = 25 − 6, 3 = "top 3"
    for (const n of numbersIn(pitchOpener(d)!)) expect(allowed.has(n), n).toBe(true);
  });

  it("leaves out whatever the data does not support", () => {
    expect(pitchOpener(data({ ai: null }))).toBe("Northgate Family Dental is outside the Google Maps top 3 at 19 of 25 spots around Austin. It has 38 reviews against a map-pack median of 112.");
    expect(pitchOpener(data({ ai: { points: 9, pointsMentioned: 4, topCompetitor: null }, maps: null, reviews: null }))).toBe("At 5 of 9 spots around Austin, AI assistants did not name Northgate Family Dental.");
    expect(pitchOpener(data({ reviews: { you: 200, median: 112 } }))).not.toContain("reviews");
    expect(pitchOpener(data({ city: null, maps: null, reviews: null }))).toContain("around the business");
  });

  it("says nothing when the business is doing well everywhere", () => {
    expect(pitchOpener(data({ ai: { points: 9, pointsMentioned: 9, topCompetitor: "X" }, maps: { points: 25, top3Points: 25, avgRank: 1.2 }, reviews: { you: 300, median: 112 } }))).toBeNull();
    expect(pitchOpener(data({ ai: null, maps: null, reviews: null }))).toBeNull();
  });
});

describe("CSV import", () => {
  it("parses quoted fields, embedded commas, doubled quotes and line breaks", () => {
    expect(parseCsv('name,city\r\n"Smith, Jones & Co","Austin"\n"The ""Best"" Diner",Dallas\n"Two\nLines",Waco\n')).toEqual([
      ["name", "city"], ["Smith, Jones & Co", "Austin"], ['The "Best" Diner', "Dallas"], ["Two\nLines", "Waco"],
    ]);
  });

  it("accepts semicolon files, a byte-order mark and common header names", () => {
    const r = parseProspectCsv("﻿Business Name;Town;State;URL;Telephone\nNorthgate Dental;Austin;TX;https://northgate.example;512 555 0174\n");
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([{ name: "Northgate Dental", address: "", city: "Austin", region: "TX", country: "", website: "https://northgate.example", phone: "512 555 0174", place_id: "" }]);
  });

  it("needs name and city, and reports rows that lack them by spreadsheet row number", () => {
    expect(parseProspectCsv("name,phone\nA,1\n").error).toMatch(/name.*city/);
    const r = parseProspectCsv("name,city\nA,Austin\n,Dallas\nC,\nD,Waco\n");
    expect(r.rows.map((x) => x.name)).toEqual(["A", "D"]);
    expect(r.problems).toEqual([{ row: 3, message: "No name." }, { row: 4, message: "No city." }]);
  });

  it("refuses more than 200 rows and empty files", () => {
    const big = "name,city\n" + Array.from({ length: 201 }, (_, i) => `B${i},Austin`).join("\n");
    expect(parseProspectCsv(big).error).toMatch(/201 rows.*200/);
    expect(parseProspectCsv("name,city\n").error).toBeTruthy();
    expect(parseProspectCsv("name,city\n" + Array.from({ length: 200 }, (_, i) => `B${i},Austin`).join("\n")).rows).toHaveLength(200);
  });
});

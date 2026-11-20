import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INDEXNOW_KEY, indexNowBody, pingIndexNow } from "@/lib/indexnow";

describe("IndexNow", () => {
  it("sends only this site's own URLs, once each, with the key file location", () => {
    const body = indexNowBody("https://rankbyai.live", ["https://rankbyai.live/ai/dentist/austin", "https://rankbyai.live/ai/dentist/austin", "https://evil.example/x", "not a url"]);
    expect(body).toEqual({
      host: "rankbyai.live", key: INDEXNOW_KEY, keyLocation: `https://rankbyai.live/${INDEXNOW_KEY}.txt`, urlList: ["https://rankbyai.live/ai/dentist/austin"],
    });
  });

  it("the key file in public/ holds exactly the key (engines verify it)", () => {
    expect(readFileSync(`public/${INDEXNOW_KEY}.txt`, "utf8")).toBe(INDEXNOW_KEY);
    expect(INDEXNOW_KEY).toMatch(/^[a-f0-9]{32}$/);
  });

  it("never pings outside production", async () => {
    expect(await pingIndexNow(["https://rankbyai.live/ai"])).toEqual({ sent: 0, status: null });
  });
});

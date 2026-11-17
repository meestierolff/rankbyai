/** Turns an AI answer into an ordered list of business names. Regex first; an LLM fallback exists for prose answers. */

const clean = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1") // [Name](url) → Name
    .replace(/\[\d+\]/g, "") // [1] citation markers
    .replace(/\(\s*https?:\/\/[^)]*\)/g, "")
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function nameFromLine(body: string): string | null {
  const bold = body.match(/\*\*(.+?)\*\*/) ?? body.match(/__(.+?)__/);
  let name = bold ? bold[1] : body;
  name = clean(name);
  if (!bold) name = name.split(/\s+[–—-]\s+|:\s|\s\|\s|\.\s/)[0];
  name = name.replace(/\s*\([^)]*\)\s*$/, "").replace(/[:.,;–—-]+$/, "").trim();
  if (name.length < 2 || name.length > 90) return null;
  if (name.split(" ").length > 12) return null;
  if (/^(note|tip|summary|overall|sources?|why|how|in short|disclaimer)\b/i.test(name)) return null;
  return name;
}

export interface NamedBusiness {
  name: string;
  position: number;
}

export function parseNamedBusinesses(text: string, max = 10): NamedBusiness[] {
  const names: string[] = [];
  const push = (n: string | null) => {
    if (n && !names.some((x) => x.toLowerCase() === n.toLowerCase())) names.push(n);
  };

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const numbered = line.match(/^\s*(?:#{1,4}\s*)?(\d{1,2})[.)]\s+(.+)$/);
    if (numbered) push(nameFromLine(numbered[2]));
  }
  if (names.length === 0) {
    for (const line of lines) {
      const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
      // Only bullets that lead with a name (bold, or "Name – reason") count.
      if (bullet && (/\*\*.+?\*\*/.test(bullet[1]) || /\s[–—-]\s|:\s/.test(bullet[1]))) push(nameFromLine(bullet[1]));
    }
  }
  if (names.length === 0) {
    for (const line of lines) {
      const heading = line.match(/^\s*#{2,4}\s+(.+)$/) ?? line.match(/^\s*\*\*(.+?)\*\*\s*$/);
      if (heading) push(nameFromLine(heading[1]));
    }
  }
  if (names.length === 0) {
    for (const m of text.matchAll(/\*\*(.+?)\*\*/g)) push(nameFromLine(m[1]));
  }
  return names.slice(0, max).map((name, i) => ({ name, position: i + 1 }));
}

export const PARSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["businesses"],
  properties: {
    businesses: {
      type: "array",
      maxItems: 10,
      items: { type: "object", additionalProperties: false, required: ["name"], properties: { name: { type: "string" } } },
    },
  },
} as const;

export const PARSE_INSTRUCTIONS =
  "Extract the local businesses that the text recommends, in the order they appear. Return business names only, exactly as written. If no specific business is named, return an empty list. Do not add businesses that are not in the text.";

/** Source domains across samples, most cited first. */
export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

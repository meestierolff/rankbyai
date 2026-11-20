/**
 * What the public free check accepts, and how a visitor's network is grouped for limits. Pure (no
 * database, no environment), so the rules are unit-tested in tests/unit/free-check-input.test.ts.
 *
 * The check runs on the house's paid API keys, so the server refuses anything that is not plausibly
 * a real business and city before a single paid call is made. The business name only searches Google
 * Maps (DataForSEO); the AI question is built from the listing's category, never from this text.
 */

export const NAME_MAX = 120;
export const CITY_MAX = 80;
const MAX_WORDS = 15;

/** One message for every rejected input: it does not teach a script which rule it tripped. */
export const INPUT_REJECTED = "Enter the business's real name and the city it is in.";

const JUNK = new Set([
  "test", "testing", "tester", "asdf", "asdfgh", "qwerty", "abc", "abcd", "xyz", "foo", "bar", "foobar", "lorem ipsum",
  "na", "n a", "none", "null", "undefined", "nothing", "business", "company", "my business", "my company", "example", "sample", "demo",
]);
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const URL_OR_EMAIL = /(https?:\/\/|www\.|\S+@\S+\.\S+)/i;
const MARKUP_OR_PROMPT = /(<\s*\/?\s*[a-z]+|\{\{|\}\}|```|\bignore (all |the )?(previous|above)\b|\bsystem prompt\b|\bas an ai\b)/i;

/** Trim, unify Unicode forms and collapse inner whitespace. */
export function normalizeField(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/** Lower case, letters and digits only, single spaces: two spellings of the same thing compare equal. */
export function comparable(value: string): string {
  return normalizeField(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function fieldProblem(value: string, max: number): boolean {
  if (value.length < 2 || value.length > max) return true;
  if (CONTROL.test(value) || URL_OR_EMAIL.test(value) || MARKUP_OR_PROMPT.test(value)) return true;
  const letters = value.match(/\p{L}/gu)?.length ?? 0;
  const digits = value.match(/\p{N}/gu)?.length ?? 0;
  if (letters < 2 || digits > letters) return true;
  const plain = comparable(value);
  if (JUNK.has(plain)) return true;
  if (/^(.)\1+$/u.test(plain.replace(/ /g, ""))) return true; // "aaaa", "zzzzzz"
  if (plain.split(" ").length > MAX_WORDS) return true;
  return false;
}

/** null when the input may be checked; otherwise the one message to show. */
export function checkInputProblem(input: { businessName: string; city: string }): string | null {
  const name = normalizeField(input.businessName);
  const city = normalizeField(input.city);
  if (fieldProblem(name, NAME_MAX) || fieldProblem(city, CITY_MAX)) return INPUT_REJECTED;
  if (comparable(name) === comparable(city)) return INPUT_REJECTED;
  return null;
}

/** The string a repeat is recognised by (hashed by the server before it is stored). */
export function inputKeySource(input: { businessName: string; city: string; country: string }): string {
  return `${comparable(input.businessName)}|${comparable(input.city)}|${input.country.toUpperCase()}`;
}

/** Expands an IPv6 address to its 8 groups; null when it is not one. */
function ipv6Groups(ip: string): string[] | null {
  const addr = ip.replace(/^\[|\]$/g, "").split("%")[0];
  if (!addr.includes(":")) return null;
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  // An embedded IPv4 tail (::ffff:203.0.113.7) counts as two groups.
  const last = tail.length ? tail[tail.length - 1] : head[head.length - 1];
  const v4Tail = last && last.includes(".") ? 1 : 0;
  const fill = 8 - head.length - tail.length - v4Tail;
  if (halves.length === 1 && fill !== 0) return null;
  if (fill < 0) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...tail];
  if (v4Tail) groups.splice(groups.length - 1, 1, "v4", "v4");
  return groups.map((g) => g.toLowerCase().replace(/^0+(?=.)/, ""));
}

/**
 * The network a visitor's limits are counted on. IPv4: the address itself for the per-IP limit, its
 * /24 for the fingerprint. IPv6: the /64 for both, because one home or phone usually holds a whole
 * /64 and can change the rest of its address at will.
 */
export function networkKeys(ip: string): { ipKey: string; prefix: string } {
  const v4 = ip.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i);
  if (v4) return { ipKey: `${v4[1]}.${v4[2]}.${v4[3]}.${v4[4]}`, prefix: `${v4[1]}.${v4[2]}.${v4[3]}.0/24` };
  const groups = ipv6Groups(ip);
  if (groups) {
    const p = `${groups.slice(0, 4).join(":")}::/64`;
    return { ipKey: p, prefix: p };
  }
  return { ipKey: ip || "unknown", prefix: ip || "unknown" };
}

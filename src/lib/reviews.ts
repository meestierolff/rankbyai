/**
 * Asking for reviews, the way Google allows it. The one tactic from the "black hat local SEO" lists
 * that works without risk is asking every customer in person; this gives the link, a QR code for a
 * counter card, and words to say, inside Google's rules.
 *
 * Read on 20 Nov 2026:
 *  - Google does not document a review-form URL built from a place ID. Business Profile help
 *    (support.google.com/business/answer/16816815) says to copy the review link or QR code from the
 *    profile ("Read reviews" → "Get more reviews" → "Share"). So the default here is the documented
 *    Maps URL for the place (developers.google.com/maps/documentation/urls/get-started, query_place_id),
 *    which opens the profile, and the owner can paste the direct review link instead.
 *  - Google's contribution policy (support.google.com/contributionpolicy/answer/7400114) forbids
 *    incentives, selectively asking happy customers, and pressuring people to review on the premises.
 */

/** The Google Maps page of a place, from its place ID (documented Maps URL). */
export function mapsPlaceUrl(name: string, placeId: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(placeId)}`;
}

/** Google's own short and long link hosts, which a review link copied from a profile uses. */
const GOOGLE_HOSTS = /^(g\.page|maps\.app\.goo\.gl|goo\.gl|(www\.|search\.|maps\.)?google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2}))$/i;

/** A pasted review link, cleaned, or null when it is not a Google link. */
export function googleReviewLink(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" || !GOOGLE_HOSTS.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** What to say, at the end of every visit. No pressure, no reward, no wording to put in the review. */
export const REVIEW_ASK = "Thanks for coming in today. If you have a minute later, an honest Google review would help us a lot. The link is on this card.";

/** Google's rules for asking, in plain words. */
export const REVIEW_RULES = [
  "Ask every customer, not only the happy ones. Google forbids asking only the people you expect to be positive.",
  "Offer nothing in return: no discount, gift or entry into a draw.",
  "Do not have them write it on the spot or tell them what to write. Hand over the card and let them review later.",
  "Reply to every review, the bad ones too.",
] as const;

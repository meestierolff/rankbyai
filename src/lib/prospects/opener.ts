/**
 * Pitch opener for a prospect report (brief 7.7): one or two factual sentences, built only from the
 * numbers in the report. No adjectives, no promises. When there is nothing notable to say, there is
 * no opener; we do not pad it.
 */
export interface OpenerData {
  business: string;
  city: string | null;
  ai: { points: number; pointsMentioned: number; topCompetitor: string | null } | null;
  maps: { points: number; top3Points: number; avgRank: number | null } | null;
  reviews: { you: number; median: number } | null;
}

export function pitchOpener(d: OpenerData): string | null {
  const where = d.city ? `around ${d.city}` : "around the business";
  const parts: string[] = [];

  if (d.ai && d.ai.points > 0) {
    const missed = d.ai.points - d.ai.pointsMentioned;
    if (missed > 0 && d.ai.topCompetitor) parts.push(`At ${missed} of ${d.ai.points} spots ${where}, AI assistants named ${d.ai.topCompetitor} and not ${d.business}`);
    else if (missed > 0) parts.push(`At ${missed} of ${d.ai.points} spots ${where}, AI assistants did not name ${d.business}`);
  }
  if (d.maps && d.maps.points > 0 && d.maps.top3Points < d.maps.points) {
    const outside = d.maps.points - d.maps.top3Points;
    parts.push(parts.length ? `it is outside the Google Maps top 3 at ${outside} of ${d.maps.points} spots` : `${d.business} is outside the Google Maps top 3 at ${outside} of ${d.maps.points} spots ${where}`);
  }
  const first = parts.length ? parts.join("; ") + "." : null;
  const second = d.reviews && d.reviews.median > d.reviews.you ? `It has ${d.reviews.you} reviews against a map-pack median of ${d.reviews.median}.` : null;
  const text = [first, second].filter(Boolean).join(" ");
  return text || null;
}

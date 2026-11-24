import { webUrl, type IndexCity } from "@/lib/ai-index/model";

export function CityRecord({ city }: { city: IndexCity }) {
  return <>
    {city.status === "parsed" ? <section><h2>Names in the order returned</h2><p>Position records the order in this answer; it is not a rating.</p><ol className="index-shortlist">{city.agencies.map(agency => <li key={agency.position} value={agency.position}><span className="index-position" aria-label={`Position ${agency.position}`}>{agency.position}</span><div><strong>{agency.name}</strong>{agency.domain ? <div>{webUrl(agency.domain) ? <a href={webUrl(agency.domain)} rel="nofollow noopener noreferrer">{agency.domain}</a> : agency.domain}</div> : null}</div></li>)}</ol></section> : <section><h2>Why this run has no shortlist</h2><p>{city.reason}</p><p>We marked this answer unparseable rather than guess. No agency shortlist is displayed for this run.</p></section>}
    <section className="index-sources"><h2>Sources ChatGPT cited on this run</h2>{city.sources.length ? <><ul>{city.sources.map((source, i) => <li key={`${source}-${i}`}>{webUrl(source) ? <a href={webUrl(source)} rel="nofollow noopener noreferrer">{city.sourceDetails?.[i]?.title ? `“${city.sourceDetails[i].title}” — ${source}` : source}</a> : source}</li>)}</ul><p>A citation is a source listed on this answer, not proof of why an agency was named.</p></> : <p>No cited sources were returned for this run.</p>}</section>
  </>;
}

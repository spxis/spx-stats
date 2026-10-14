import Link from "next/link";

/**
 * Whether /venue/Q<wikidata id> answers for a World Cup or MLS ground. Checked 2026-10-14 against production and a local build of main: the route exists, but
 * its index (lib/venuePage.ts) holds only the home venues of the five leagues, so /venue/Q1186333 (Lusail Stadium) and /venue/Q786149 (the 1930 final's ground) are a 404
 * even though api.venue_ref holds both. Set this to true once the world stadium dataset's pages serve those ids; the links below are then live on the
 * World Cup and MLS match pages and the stadium lists, with nothing else to change.
 */
export const STADIUM_PAGES_LIVE = false;

/**
 * A stadium's name as a World Cup or MLS page prints it. When the match knows its ground by a Wikidata id, the name links to /venue/Q<id>, which redirects
 * to the venue's own page (the world stadium dataset, scripts/world_stadiums/); otherwise it is plain text. `linked` is false for a row whose ground
 * the dataset does not hold (a match with a Wikidata id but no venue_id), so the link never leads to a 404. `rest` is the city and country written after the name.
 */
export function StadiumName({ name, qid, linked = true, rest }: { name: string | null | undefined; qid: string | null | undefined; linked?: boolean; rest?: string }) {
  if (!name) return rest ? <>{rest}</> : null;
  const tail = rest ? `, ${rest}` : "";
  return STADIUM_PAGES_LIVE && qid && linked && /^Q\d+$/.test(qid) ? <><Link href={`/venue/${qid}`} prefetch={false}>{name}</Link>{tail}</> : <>{name}{tail}</>;
}

import "server-only";
import { cache } from "react";
import { z } from "zod";
import { groundByWikidata } from "@johnmorrisdotca/kyogijo-stadiums";
import { ApiError, rows as readRows } from "./api/client";
import { rows } from "./soccer";
import { citedTitle, currentName, spansOf, type Pitch, type SoccerName, type SoccerVenue } from "./venueSoccerRows";
import type { VenueMatch } from "./venueSoccerGames";

/**
 * The world soccer stadiums: every core.venue with a World Cup or MLS match, read from the api views. A view the database does not have yet reads as no rows
 * (lib/soccer.ts), so a production without the soccer data, or without migration 088, shows what it can:
 *   api.soccer_matches  which stadium (venue_id) staged a match of which competition and year: the stadiums that have a page
 *   api.venue_ref       their Wikidata id and name (migration 082)
 *   api.venue_soccer    their place, coordinates, capacity, dates, address and names (migration 088); until it is on the server the facts come from kyogijo's
 *                       64 grounds, and a stadium it does not hold has a page but no place on the map
 *   api.venue_pitch     the pitch size the English Wikipedia article gives (migration 079)
 */

const ref = z.object({ venue_id: z.number(), wikidata_id: z.string(), name: z.string().nullable() });
const played = z.object({ venue_id: z.number(), league: z.string(), year: z.number() });
const span = z.object({ venue_id: z.number(), league: z.string(), first_year: z.number(), last_year: z.number(), matches: z.number() });

/**
 * The matches each stadium staged, by competition: api.venue_soccer_span has a row for each stadium and competition (about 600 rows, one request);
 * until it is on the server (migration 166, a 404) every match is a row of api.soccer_matches (about 10,000, eleven requests).
 */
async function playedAt() {
  try {
    return (await readRows("venue_soccer_span", "select=venue_id,league,first_year,last_year,matches&order=venue_id,league", span))
      .map((r) => ({ venue_id: r.venue_id, league: r.league, year: r.first_year, last_year: r.last_year, matches: r.matches }));
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) throw e;
    return rows("soccer_matches", "venue_id=not.is.null&select=venue_id,league,year&order=match_id", played);
  }
}
const nNum = z.number().nullable();
const nText = z.string().nullable();
const fact = z.object({
  venue_id: z.number(), city: nText, region: nText, country_code: nText, latitude: nNum, longitude: nNum, capacity: nNum, opened_year: nNum, closed_year: nNum,
  surface: nText, roof: nText, address: nText, postal_code: nText,
  names: z.array(z.object({ name: z.string(), from: nNum, to: nNum })),
});
const pitch = z.object({ wikidata_id: z.string(), length_m: z.coerce.number(), width_m: z.coerce.number(), wikipedia_key: z.string() });

/** The pitch of the Laws of Game for international matches, which a stadium with no published size is drawn at. */
const STANDARD: Pitch = { length: 105, width: 68, source: "standard", cite: null };

/** A size to the half metre, which is how finely the drawings are kept (venueDraw.ts). */
export const halfMetre = (m: number): number => Math.round(m * 2) / 2;

function pitchOf(wid: string, published: ReadonlyMap<string, z.infer<typeof pitch>>): { pitch: Pitch; title: string | null } {
  const g = groundByWikidata(wid);
  const p = published.get(wid);
  if (g && g.pitchSize === "published") return { pitch: { length: g.pitch.length, width: g.pitch.width, source: "published", cite: p?.wikipedia_key ?? `enwiki:${g.en.title}@${g.en.revision}` }, title: g.en.title };
  if (p) return { pitch: { length: Number(p.length_m), width: Number(p.width_m), source: "published", cite: p.wikipedia_key }, title: g?.en.title ?? citedTitle(p.wikipedia_key) };
  return { pitch: STANDARD, title: g?.en.title ?? null };
}

/** Every stadium that has a soccer match, by name. Read once per render pass. */
export const getSoccerVenues = cache(async (): Promise<SoccerVenue[]> => {
  const [refs, played_, facts, pitches] = await Promise.all([
    rows("venue_ref", "select=venue_id,wikidata_id,name&order=venue_id", ref),
    playedAt(),
    rows("venue_soccer", "select=venue_id,city,region,country_code,latitude,longitude,capacity,opened_year,closed_year,surface,roof,address,postal_code,names&order=venue_id", fact),
    rows("venue_pitch", "select=wikidata_id,length_m,width_m,wikipedia_key&order=wikidata_id", pitch),
  ]);
  const spans = spansOf(played_);
  const byRef = new Map(refs.map((r) => [r.venue_id, r]));
  const byFact = new Map(facts.map((f) => [f.venue_id, f]));
  const published = new Map(pitches.map((p) => [p.wikidata_id.toUpperCase(), p]));
  const out: SoccerVenue[] = [];
  for (const [venueId, s] of spans) {
    const r = byRef.get(venueId);
    if (!r || !/^Q[1-9]\d{0,14}$/.test(r.wikidata_id)) continue;
    const wid = r.wikidata_id.toUpperCase();
    const f = byFact.get(venueId);
    const g = groundByWikidata(wid);
    const names: SoccerName[] = f?.names.length ? f.names.map((n) => ({ name: n.name, from: n.from, until: n.to })) : [{ name: r.name ?? g?.name ?? wid, from: null, until: null }];
    const { pitch: size, title } = pitchOf(wid, published);
    out.push({
      venueId, wid, name: r.name ?? currentName(names, g?.name ?? wid), names,
      city: f?.city ?? g?.city ?? null, region: f?.region ?? null, cc: f?.country_code ?? g?.country ?? null,
      lat: f?.latitude ?? g?.lat ?? null, lon: f?.longitude ?? g?.lon ?? null,
      capacity: f?.capacity ?? g?.capacity ?? null, opened: f ? f.opened_year : g?.from ?? null,
      closed: f?.closed_year ?? (g?.status === "past" ? g.to ?? null : null),
      surface: f?.surface ?? null, roof: f?.roof ?? null, address: f?.address ?? null, postal: f?.postal_code ?? null,
      wikiTitle: title, pitch: size, spans: s,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "en") || a.wid.localeCompare(b.wid));
});

const match = z.object({
  match_id: z.number(), league: z.string(), year: z.number(), stage_key: z.string(), stage_order: z.number(), group_name: nText, match_date: z.string(),
  home_team_id: z.string(), home: z.string(), home_slug: z.string(), home_flag: nText, home_goals: z.number(),
  away: z.string(), away_slug: z.string(), away_flag: nText, away_goals: z.number(),
  extra_time: z.boolean(), shootout: z.boolean(), home_penalties: nNum, away_penalties: nNum,
});

/** The matches played at a stadium, oldest first. */
export const getVenueMatches = cache(async (venueId: number): Promise<VenueMatch[]> =>
  Number.isInteger(venueId) && venueId > 0 && venueId < 1e9
    ? rows("soccer_matches",
      `venue_id=eq.${venueId}&select=match_id,league,year,stage_key,stage_order,group_name,match_date,home_team_id,home,home_slug,home_flag,home_goals,away,away_slug,away_flag,away_goals,extra_time,shootout,home_penalties,away_penalties&order=match_date.asc,match_id.asc`,
      match)
    : []);

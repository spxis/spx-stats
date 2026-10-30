import "server-only";
import type { z } from "zod";
import { cache } from "react";
import { ApiError, rows as readRows } from "./api/client";
import { officialAbbr } from "./abbr";
import { brandFor, logoFor } from "./brand";
import type { TeamBrandRow } from "./api/types";
import { clubMatcher } from "./allStarClubs";
import { getAbbrs, getBrands } from "./data";
import { getFranchiseNameRows } from "./franchiseNames";
import { seasonUnder } from "./nameEras";
import {
  allStarEventSchema, allStarGameSchema, allStarMvpSchema, allStarSelectionSchema, personRows,
  type AllStarLeague, type AllStarSelection, type PersonAllStar,
} from "./allStarView";

/**
 * The All-Star Games, read from the api views of migration 145 (docs/all-star-games.md). A view the database does not have yet (404: the migration or the data
 * release has not reached production) reads as no rows, so the pages hide their All-Star sections and nothing says "Couldn't load". Any other failure throws
 * ApiError like the rest of lib/api.
 */
async function rows<S extends z.ZodType>(view: string, query: string, schema: S): Promise<z.infer<S>[]> {
  try {
    return await readRows(view, query, schema);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return [];
    throw e;
  }
}

const EMPTY: AllStarLeague = { events: [], games: [], mvps: [] };
const lg = (league: string) => encodeURIComponent(league.toLowerCase());

/** Every event, game and MVP of one league, oldest first. Empty when the archive holds none. */
export async function getAllStar(league: string): Promise<AllStarLeague> {
  if (!/^[a-z]{2,8}$/.test(league)) return EMPTY;
  const q = `league=eq.${lg(league)}`;
  const [events, games, mvps] = await Promise.all([
    rows("all_star_event", `${q}&order=year.asc,event_no.asc`, allStarEventSchema),
    rows("all_star_game", `${q}&order=year.asc,event_no.asc,game_no.asc`, allStarGameSchema),
    rows("all_star_mvp", `${q}&order=year.asc,event_no.asc,seq.asc`, allStarMvpSchema),
  ]);
  return { events, games, mvps };
}

/** The roster lines of the events a league played in one calendar year. */
export async function getAllStarSelections(league: string, year: number): Promise<AllStarSelection[]> {
  if (!/^[a-z]{2,8}$/.test(league) || !Number.isInteger(year)) return [];
  return rows("all_star_selection", `league=eq.${lg(league)}&year=eq.${year}&order=event_no.asc,seq.asc`, allStarSelectionSchema);
}

/** A person's All-Star Games (picked or Most Valuable Player), newest first. Empty for a person the archive could not link to any. */
export async function getPersonAllStar(personId: number): Promise<PersonAllStar[]> {
  if (!Number.isInteger(personId) || personId <= 0) return [];
  const [sel, mvp] = await Promise.all([
    rows("all_star_selection", `person_id=eq.${personId}&order=year.desc`, allStarSelectionSchema),
    rows("all_star_mvp", `person_id=eq.${personId}&order=year.desc`, allStarMvpSchema),
  ]);
  return personRows(sel, mvp);
}

/** The clubs of one league for the All-Star pages: the club a line of text names in a season, and the logo it wore that season. */
export interface Clubs {
  /** The franchise a roster or MVP line names in the season `year` (a season is named by its first year), or null when the text fits no club or several. */
  match(text: string | null | undefined, year: number | null): number | null;
  /** The logo a franchise wore that season; null where none is held. */
  logo(f: number | null | undefined, year: number | null): string | null;
  /** The brand era (colours) a franchise had that season, for the colours of its side; null where none is held. */
  brand(f: number | null | undefined, year: number | null): TeamBrandRow | null;
}

/**
 * The reads that tell a club from a line of text: the franchise names with the days each applied (one read for the league, not one per season), the abbreviations and the
 * brand eras (both kept a day and shared with every other page). A failed read leaves the names plain and the logos out.
 */
export const getClubs = cache(async (league: string): Promise<Clubs> => {
  const lgq = /^[a-z]{2,8}$/.test(league) ? league : "none";
  const [names, brands, abbrs] = await Promise.all([
    getFranchiseNameRows().then((all) => all.filter((n) => n.league === lgq)).catch(() => []),
    getBrands().catch(() => ({})),
    getAbbrs(lgq).catch(() => ({})),
  ]);
  const byYear = new Map<number, ReturnType<typeof clubMatcher>>();
  const matcher = (year: number) => {
    let m = byYear.get(year);
    if (!m) {
      m = clubMatcher(names.filter((n) => seasonUnder({ from: n.name_from, to: n.name_to }, year)).map((n) => ({ franchise_id: n.franchise_id, team: n.name, abbr: officialAbbr(abbrs, n.franchise_id, year) })));
      byYear.set(year, m);
    }
    return m;
  };
  return {
    match: (text, year) => (year == null ? null : matcher(year)(text)),
    logo: (f, year) => (year == null ? logoFor(brands, f) : logoFor(brands, f, year)),
    brand: (f, year) => brandFor(brands, f, year ?? undefined),
  };
});

import "server-only";
import type { z } from "zod";
import { ApiError, rows as readRows } from "./api/client";
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

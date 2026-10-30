import "server-only";
import { cache } from "react";
import { z } from "zod";
import { ApiError, rows, viewMissing } from "./api/client";
import { canFallBack } from "./api/soften";
import { LEAGUES } from "./leagues";

/** The leagues of the menu: no player is filed under a rival or predecessor league (the AFL, the NHA), so the pairs are theirs only. */
const LEAGUE_CODES: string[] = LEAGUES.map((l) => l.code);
import { playerPath, primaryLeague, primaryLeagueBy } from "./playerPath";
import { peopleFromPack, playerLeaguePackSchema } from "./playerLeaguePack";

const multiRow = z.object({ person_id: z.number(), leagues: z.array(z.string()).nullable() });
const seasonRow = z.object({ person_id: z.number(), league: z.string(), year: z.number() });

const pairs = LEAGUE_CODES.flatMap((a, i) => LEAGUE_CODES.slice(i + 1).map((b) => `leagues.cs.${encodeURIComponent(`{${a},${b}}`)}`));
const CHUNK = 150;

/**
 * The people who played in more than one league of the menu. api.player_multi_league (migration 167) lists the people with more than one league
 * of any kind, which is filtered again here; until it is on the server (a 404) the whole people list is asked one league pair at a time, which takes 36 tests of every person.
 */
async function multiLeaguePeople() {
  try {
    const listed = await rows("player_multi_league", "select=person_id,leagues&order=person_id", multiRow);
    return listed.filter((p) => (p.leagues ?? []).filter((l) => LEAGUE_CODES.includes(l)).length > 1);
  } catch (e) {
    if (!(e instanceof ApiError) || !e.message.endsWith(": 404")) throw e;
    return rows("player_index", `select=person_id,leagues&or=(${pairs.join(",")})`, multiRow);
  }
}

/**
 * The league each person who played in more than one is filed under (everyone else has just the one). Throws ApiError when the archive cannot be read.
 * api.player_league_pack (migration 186) holds the people and each one's seasons in each league, so this is one request; while it is a 404 the people and then
 * their seasons are read from api.player_multi_league and api.person_season_teams.
 */
export const getMultiLeague = cache(async (): Promise<Map<number, string>> => {
  try {
    const [pack] = await rows("player_league_pack", "select=*&order=id", playerLeaguePackSchema);
    if (pack) {
      const found = new Map<number, string>();
      for (const p of peopleFromPack(pack)) {
        if (p.leagues.filter((l) => LEAGUE_CODES.includes(l)).length < 2) continue;
        const lg = primaryLeagueBy(p.leagues, p.stats);
        if (lg) found.set(p.person_id, lg);
      }
      return found;
    }
  } catch (e) {
    if (!viewMissing(e)) throw e;
  }
  const multi = await multiLeaguePeople();
  const out = new Map<number, string>();
  for (let i = 0; i < multi.length; i += CHUNK) {
    const part = multi.slice(i, i + CHUNK);
    const seasons = await rows("person_season_teams", `person_id=in.(${part.map((p) => p.person_id).join(",")})&select=person_id,league,year`, seasonRow);
    for (const p of part) {
      const lg = primaryLeague(p.leagues ?? [], seasons.filter((s) => s.person_id === p.person_id));
      if (lg) out.set(p.person_id, lg);
    }
  }
  return out;
});

/** The league a person's page lives under; null when no league is known. Throws ApiError when the archive cannot be read. */
export async function homeLeague(p: { person_id: number; leagues: string[] | null }): Promise<string | null> {
  return (await getMultiLeague()).get(p.person_id) ?? p.leagues?.[0] ?? null;
}

/**
 * Address builder for lists: `const player = await getPlayerPaths(); player(id, name, league)`, where `league` is any league the person played in
 * (a list of one league's awards or leaders knows that, a players list has the first of the person's leagues). A person with several leagues gets
 * their own; with no league known it is the old /players/{id}, which redirects. If the archive cannot be read the given league is used.
 */
export const getPlayerPaths = cache(async () => {
  const multi = await getMultiLeague().catch((e) => {
    if (!canFallBack(e)) throw e;
    return new Map<number, string>();
  });
  return (id: number, name: string, league?: string | null): string => {
    const lg = multi.get(id) ?? league;
    return lg ? playerPath(lg, id, name) : `/players/${id}`;
  };
});

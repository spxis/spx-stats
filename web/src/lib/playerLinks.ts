import "server-only";
import { cache } from "react";
import { z } from "zod";
import { ApiError, rows } from "./api/client";
import { LEAGUE_CODES } from "./leagues";
import { playerPath, primaryLeague } from "./playerPath";

const multiRow = z.object({ person_id: z.number(), leagues: z.array(z.string()).nullable() });
const seasonRow = z.object({ person_id: z.number(), league: z.string(), year: z.number() });

const pairs = LEAGUE_CODES.flatMap((a, i) => LEAGUE_CODES.slice(i + 1).map((b) => `leagues.cs.${encodeURIComponent(`{${a},${b}}`)}`));
const CHUNK = 150;

/** The league each person who played in more than one is filed under (everyone else has just the one). Throws ApiError when the archive cannot be read. */
export const getMultiLeague = cache(async (): Promise<Map<number, string>> => {
  const multi = await rows("player_index", `select=person_id,leagues&or=(${pairs.join(",")})`, multiRow);
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
    if (!(e instanceof ApiError)) throw e;
    return new Map<number, string>();
  });
  return (id: number, name: string, league?: string | null): string => {
    const lg = multi.get(id) ?? league;
    return lg ? playerPath(lg, id, name) : `/players/${id}`;
  };
});

import { slugify } from "./slug.ts";

/** A player's page address: /nhl/player/nathan-mackinnon-2430. The id is the last hyphen-separated part and is what identifies the person; the name is for people. */
export const playerPath = (league: string, id: number, name: string): string => {
  const slug = slugify(name);
  return `/${league}/player/${slug ? `${slug}-${id}` : id}`;
};

/** The person id at the end of a player address segment ("nathan-mackinnon-2430", or just "2430"); null when it has none. */
export function playerIdOf(seg: string): number | null {
  const m = /(?:^|-)(\d{1,9})$/.exec(seg);
  return m ? Number(m[1]) : null;
}

/** The league a person is filed under: the one with most seasons, ties to the one played in most recently, then by code. A league with no seasons on record counts as none. */
export function primaryLeague(leagues: readonly string[], seasons: readonly { league: string; year: number }[]): string | null {
  const by = new Map<string, { years: Set<number>; last: number }>();
  for (const s of seasons) {
    const e = by.get(s.league) ?? by.set(s.league, { years: new Set(), last: 0 }).get(s.league)!;
    e.years.add(s.year);
    e.last = Math.max(e.last, s.year);
  }
  return primaryLeagueBy(leagues, new Map([...by].map(([lg, e]) => [lg, { seasons: e.years.size, last: e.last }])));
}

/** The same choice from the count of different seasons a person has in each league and the newest of them (api.player_league_pack). */
export function primaryLeagueBy(leagues: readonly string[], counts: ReadonlyMap<string, { seasons: number; last: number }>): string | null {
  const rank = (l: string) => counts.get(l) ?? { seasons: 0, last: 0 };
  return [...leagues].sort((a, b) => rank(b).seasons - rank(a).seasons || rank(b).last - rank(a).last || a.localeCompare(b))[0] ?? null;
}

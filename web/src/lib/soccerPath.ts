import { slugify } from "./slug.ts";

/**
 * Addresses of the World Cup pages (no server code, so a client component can use them too):
 *   /soccer                                the sport's page
 *   /worldcup                              every tournament, men's and women's
 *   /worldcup/2022                         one tournament (a year is only ever one tournament: the women's are in other years)
 *   /worldcup/2022/match/832-argentina-france
 *   /worldcup/teams, /worldcup/team/brazil
 *   /worldcup/player/lionel-messi-4711     (the id at the end is the person's id, as for players elsewhere)
 */
export const SOCCER_PATH = "/soccer";
export const WORLDCUP_PATH = "/worldcup";
export const WORLDCUP_TEAMS_PATH = "/worldcup/teams";

export const tournamentPath = (year: number): string => `/worldcup/${year}`;
export const soccerTeamPath = (slug: string): string => `/worldcup/team/${slug}`;
export const soccerMatchPath = (year: number, id: number, home: string, away: string): string => {
  const slug = slugify(`${home} ${away}`);
  return `/worldcup/${year}/match/${slug ? `${id}-${slug}` : id}`;
};
export const soccerPlayerPath = (id: number, name: string): string => {
  const slug = slugify(name);
  return `/worldcup/player/${slug ? `${slug}-${id}` : id}`;
};

/** The match id at the start of a match address segment ("832-argentina-france", or just "832"); null when it has none. */
export function soccerMatchIdOf(seg: string): number | null {
  const m = /^(\d{1,9})(?:-|$)/.exec(seg);
  return m ? Number(m[1]) : null;
}

/** The tournament id of a year in an address ("2022" -> a men's or women's tournament: the caller looks the year up). */
export const isYearSeg = (seg: string): boolean => /^\d{4}$/.test(seg);
export const isTeamSlug = (seg: string): boolean => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(seg);

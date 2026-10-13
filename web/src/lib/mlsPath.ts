import { slugify } from "./slug.ts";

/**
 * Addresses of the Major League Soccer pages (no server code, so a client component can use them too):
 *   /mls                              the league: every season, the clubs, the all-time table
 *   /mls/2019                         one season: tables, playoffs, results, leaders
 *   /mls/2019/match/512-seattle-sounders-fc-toronto-fc
 *   /mls/teams                        every club
 *   /mls/team/la-galaxy               one club: names, seasons, titles, matches
 */
export const MLS_PATH = "/mls";
export const MLS_TEAMS_PATH = "/mls/teams";

export const mlsSeasonPath = (year: number): string => `/mls/${year}`;
export const mlsClubPath = (slug: string): string => `/mls/team/${slug}`;
export const mlsMatchPath = (year: number, id: number, home: string, away: string): string => {
  const slug = slugify(`${home} ${away}`);
  return `/mls/${year}/match/${slug ? `${id}-${slug}` : id}`;
};

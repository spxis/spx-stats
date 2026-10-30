/**
 * The table of every team of a season on the team leaders page as short lines of plain data, not drawn cells: a college football season has about 137 teams, each of seven cells
 * with a logo and a link, which travelled twice (as markup and as the elements the page sent to the browser, 228 KB of payload). The page draws its first rows from these
 * lines and the browser builds the others when "Show all" is pressed. Pure, so a node script can test it.
 */
export const LEADER_HEAD = 20;

/** [row key, franchise, name, abbreviation or "", logo address or "", the statistic's value, games played, wins, losses, ties, overtime losses, place among the season's teams, place among every team-season of the league]. */
export type LeaderTeamLine = [id: number, franchise: number, name: string, abbr: string, logo: string, value: number, gp: number | null, w: number, l: number, t: number | null, otl: number | null, rank: number, ever: number];

export interface LeaderTeamInput {
  id: number; franchise: number; name: string; abbr: string | undefined; logo: string | null | undefined; value: number;
  gp: number | null; w: number | null; l: number | null; t: number | null; otl: number | null;
}

/** The lines, best first (the table's own first order), each with its two places worked out by `rank` and `ever`. */
export const buildLeaderLines = (teams: readonly LeaderTeamInput[], rank: (value: number) => number, ever: (value: number) => number): LeaderTeamLine[] =>
  teams.map((x) => [x.id, x.franchise, x.name, x.abbr ?? "", x.logo ?? "", x.value, x.gp, x.w ?? 0, x.l ?? 0, x.t, x.otl, rank(x.value), ever(x.value)]);

/** The bar behind a value: its share of the way from the season's weakest team to its best, never less than a sliver. */
export const leaderShare = (value: number, best: number, last: number): number => (best === last ? 1 : Math.max(0.04, Math.abs(value - last) / Math.abs(best - last)));

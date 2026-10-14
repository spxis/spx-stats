/**
 * The Teams column of /players: the rows of api.player_teams (migration 098) shaped into each player's teams, in the order he played for them,
 * with the few that are drawn and the rest for a "+N". Pure, so a node script can test it.
 */

/** What `?team=` may hold: a club's address segment as on its page (lower case words joined by hyphens, as `montreal-canadiens`; an old numeric id too). */
export const TEAM_SEGMENT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A row of api.player_teams: one player's time with one franchise (seasons are start years). */
export interface TeamRow { person_id: number; franchise_id: number; league: string | null; first_year: number; last_year: number; seasons: number }

/** At most this many logos are drawn in a row; the others are "+N" with the whole list in its tooltip. */
export const SHOWN_TEAMS = 4;

/** Each player's teams, the earliest first (ties by last season, then franchise). */
export function groupTeams(rows: readonly TeamRow[]): Map<number, TeamRow[]> {
  const out = new Map<number, TeamRow[]>();
  for (const r of rows) (out.get(r.person_id) ?? out.set(r.person_id, []).get(r.person_id)!).push(r);
  for (const list of out.values()) list.sort((a, b) => a.first_year - b.first_year || a.last_year - b.last_year || a.franchise_id - b.franchise_id);
  return out;
}

/** The first `max` teams to draw and how many are left over. */
export function split<T>(list: readonly T[], max = SHOWN_TEAMS): { shown: T[]; more: T[] } {
  if (list.length <= max) return { shown: [...list], more: [] };
  return { shown: list.slice(0, max), more: list.slice(max) };
}

/** "1999", or "1999–2004" when it is more than one season. Seasons are shown by their start year, as on the Years column. */
export const yearsText = (first: number, last: number): string => (last > first ? `${first}–${last}` : String(first));

/** One line of a tooltip: the club's name and the years with it. */
export const stintLine = (name: string, r: Pick<TeamRow, "first_year" | "last_year">): string => `${name} ${yearsText(r.first_year, r.last_year)}`;

/** The whole list as the tooltip of the "+N": one club a line. */
export const tooltip = (lines: readonly string[]): string => lines.join("\n");

/** The ids of the players of a page of the list, as the `person_id=in.(..)` filter of the read (each once). */
export const idFilter = (ids: Iterable<number>): string => `person_id=in.(${[...new Set(ids)].join(",")})`;

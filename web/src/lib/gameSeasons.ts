/**
 * Which seasons to look in for a league's nearest game day. A read of `api.games` with no year filter scans every game of
 * every league (the view reaches its league only through a join to the season), so each read names a season (`year=eq.`), which
 * becomes a season filter on the `(season_id, game_date)` index. A season is labelled by the year it starts in and one never
 * overlaps the next, so seasons are searched in order and the first one with a game on the right side of the day holds the answer.
 */

/** Most seasons tried for one lookup (the day's own, then up to two neighbours). */
export const MAX_SEASON_STEPS = 3;

/** The counts of a season_summary row that say whether a season has any game (the summary's `games` counts regular season games only). */
export type SeasonCounts = { year: number; games: number; finals: number; playoff_finals: number };

/** The start years of a league's seasons that have games, ascending. */
export function playedYears(seasons: SeasonCounts[]): number[] {
  return seasons.filter((s) => s.games > 0 || s.finals > 0 || s.playoff_finals > 0).map((s) => s.year).sort((a, b) => a - b);
}

/**
 * The seasons to look in, nearest first, for the game day strictly before or after `day` (YYYY-MM-DD), from the played years:
 * before a day, the seasons that start in the day's year or earlier, latest first; after it, those starting in the year before
 * the day's (a season runs into the next calendar year) or later, earliest first. At most `max` of them.
 */
export function seasonSteps(years: number[], day: string, side: "before" | "after", max = MAX_SEASON_STEPS): number[] {
  const y = Number(day.slice(0, 4));
  if (!Number.isFinite(y)) return [];
  const sorted = [...years].sort((a, b) => a - b);
  return (side === "before" ? sorted.filter((s) => s <= y).reverse() : sorted.filter((s) => s >= y - 1)).slice(0, max);
}

/** The seasons that can hold a game between two days (both included): those starting from the year before the first day's to the last day's year. */
export function windowSteps(years: number[], first: string, last: string): number[] {
  const a = Number(first.slice(0, 4));
  const b = Number(last.slice(0, 4));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
  return [...years].sort((x, y) => x - y).filter((s) => s >= a - 1 && s <= b);
}

/** The seasons to try for a league's first game day (earliest first) or last (latest first), at most `max`. */
export function edgeSteps(years: number[], edge: "first" | "last", max = MAX_SEASON_STEPS): number[] {
  const sorted = [...years].sort((a, b) => a - b);
  return (edge === "first" ? sorted : sorted.reverse()).slice(0, max);
}

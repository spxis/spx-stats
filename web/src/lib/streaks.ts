/**
 * Winning and losing streaks, worked out from final regular-season games.
 *
 * One convention for every league: only a win extends a winning streak and only a loss extends a losing streak.
 * A tie, and an overtime or shootout loss in a league whose standings count those apart (`countsOtl`), is neither a
 * win nor a loss here, so it ends both kinds of streak. In a league that does not tell them apart, an overtime loss
 * is a loss. Playoff, preseason and all-star games are not counted.
 */

import type { GameRow } from "./api/types";

/** A game result from one team's side. OTL only occurs in a league whose standings count overtime losses. */
export type Outcome = "W" | "L" | "T" | "OTL";

/** A final game with both scores, whichever ids the caller uses for the two sides (team ids or franchise ids). */
export interface PlayedGame {
  date: string;
  home: number;
  away: number;
  homeScore: number;
  awayScore: number;
  overtime: boolean;
}

/** A run of the same result: how many games, and the dates of the first and the last. */
export interface Run {
  kind: Outcome;
  length: number;
  from: string;
  to: string;
}

export interface TeamStreaks {
  /** The run ending at the team's latest game, of any kind; null before its first game. */
  current: Run | null;
  /** The longest winning run (the earliest when several are as long); null with no win. */
  win: Run | null;
  /** The longest losing run; null with no loss. */
  loss: Run | null;
}

export interface Result {
  date: string;
  res: Outcome;
}

export function outcomeOf(mine: number, theirs: number, overtime: boolean, countsOtl: boolean): Outcome {
  if (mine > theirs) return "W";
  if (mine < theirs) return overtime && countsOtl ? "OTL" : "L";
  return "T";
}

/** Each side's results in the order played. Games on one day keep the order they were given in. */
export function resultsByTeam(games: PlayedGame[], countsOtl: boolean): Map<number, Result[]> {
  const sorted = games.map((g, i) => ({ g, i })).sort((a, b) => (a.g.date < b.g.date ? -1 : a.g.date > b.g.date ? 1 : a.i - b.i));
  const out = new Map<number, Result[]>();
  const add = (id: number, date: string, res: Outcome) => {
    const list = out.get(id);
    if (list) list.push({ date, res }); else out.set(id, [{ date, res }]);
  };
  for (const { g } of sorted) {
    add(g.home, g.date, outcomeOf(g.homeScore, g.awayScore, g.overtime, countsOtl));
    add(g.away, g.date, outcomeOf(g.awayScore, g.homeScore, g.overtime, countsOtl));
  }
  return out;
}

/** The current run and the longest winning and losing runs of results given in the order played. */
export function teamStreaks(results: Result[]): TeamStreaks {
  const out: TeamStreaks = { current: null, win: null, loss: null };
  for (const r of results) {
    const run: Run = out.current && out.current.kind === r.res ? { ...out.current, length: out.current.length + 1, to: r.date } : { kind: r.res, length: 1, from: r.date, to: r.date };
    out.current = run;
    if (run.kind === "W" && (!out.win || run.length > out.win.length)) out.win = run;
    if (run.kind === "L" && (!out.loss || run.length > out.loss.length)) out.loss = run;
  }
  return out;
}

export interface LeagueStreak {
  length: number;
  /** Every side at that length, in the order the sides were given. */
  teams: number[];
}

/** The longest current winning (or losing) streak among sides, and who holds it; null when none reaches `min` games. */
export function longestCurrent(results: Map<number, Result[]>, kind: "W" | "L", min = 2): LeagueStreak | null {
  let best: LeagueStreak | null = null;
  for (const [team, list] of results) {
    const c = teamStreaks(list).current;
    if (!c || c.kind !== kind || c.length < min) continue;
    if (!best || c.length > best.length) best = { length: c.length, teams: [team] };
    else if (c.length === best.length) best.teams.push(team);
  }
  return best;
}

/** A season is in progress for streaks when no champion is crowned and regular-season games are still to be played. */
export function regularSeasonOpen(games: { regular: boolean; scheduled: boolean }[], champion: boolean): boolean {
  return !champion && games.some((g) => g.regular && g.scheduled);
}

/** The final regular-season games of a franchise's season as streak input, oldest first, each side named by its franchise. */
export function playedFromRows(rows: GameRow[]): PlayedGame[] {
  return rows
    .filter((g) => g.phase === "regular" && g.status === "final" && g.home_score != null && g.away_score != null && g.home_f != null && g.away_f != null)
    .sort((a, b) => (a.game_date < b.game_date ? -1 : a.game_date > b.game_date ? 1 : a.game_id - b.game_id))
    .map((g) => ({ date: g.game_date, home: g.home_f!, away: g.away_f!, homeScore: g.home_score!, awayScore: g.away_score!, overtime: !!g.overtime }));
}

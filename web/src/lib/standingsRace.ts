/**
 * The standings race of a season (a bump chart): each club's rank in the league after every week of the regular season. Pure; the season page's
 * games are the only input, so the chart costs the page no data of its own (components/StandingsRace.tsx reads them from the games it already fetches).
 *
 * The order is the standings table's own: winning share w / (w + l + otl), wins breaking a tie (ties are no win and no loss there). Two clubs
 * still level after that keep the order they had the week before (so a tie does not make a line jump), then the lower id. A club has no rank
 * until its first game, so a line starts where its club does. Weeks with no game (an all-star break, a strike) are left out: the chart's
 * steps are weeks played, not calendar weeks.
 */

import type { GameTuple } from "./season.ts";
import { outcomeOf } from "./streaks.ts";

/** Wins, losses, ties, overtime losses (the last only where the league counts them apart). */
export type RaceRecord = [w: number, l: number, t: number, o: number];

export interface RaceTeam {
  id: number;
  /** The club's rank, 1 first, after each week of `Race.weeks`; null before its first game. */
  ranks: (number | null)[];
  /** The club's record after each week; null before its first game. */
  recs: (RaceRecord | null)[];
}

export interface Race {
  /** The first day (YYYY-MM-DD) of each week that held a game, oldest first. */
  weeks: string[];
  /** Every club that played, the club first at the end first. */
  teams: RaceTeam[];
}

const DAY = 86_400_000;
const dayNumber = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const isoOf = (n: number): string => new Date(n * DAY).toISOString().slice(0, 10);

/** The first day of the week holding `date`; `weekStart` is the weekday it starts on, 0 Sunday to 6 Saturday. */
export function weekStartOf(date: string, weekStart = 1): string {
  const n = dayNumber(date);
  // 1970-01-01 was a Thursday (4).
  const dow = (n + 4) % 7;
  return isoOf(n - ((dow - weekStart + 7) % 7));
}

/** The share the standings table ranks by; a club with no win, loss or overtime loss yet is last. */
const share = (r: RaceRecord): number => (r[0] + r[1] + r[3] ? r[0] / (r[0] + r[1] + r[3]) : -1);

/**
 * Each club's rank after every week of the regular season, or null when there is nothing to draw (fewer than two clubs or two weeks played).
 * `countsOtl` is true where the standings count overtime losses apart (the NHL from 1999); `weekStart` is the weekday a week begins on
 * (Monday, except the NFL's Tuesday, which puts Thursday to Monday night in one week).
 */
export function standingsRace(games: readonly GameTuple[], countsOtl: boolean, weekStart = 1): Race | null {
  const played = games.filter((g) => g[5] === "r" && g[6] === "f" && g[2] != null && g[3] != null);
  if (!played.length) return null;
  const byWeek = new Map<string, GameTuple[]>();
  for (const g of played) {
    const k = weekStartOf(g[0], weekStart);
    const list = byWeek.get(k);
    if (list) list.push(g); else byWeek.set(k, [g]);
  }
  const weeks = [...byWeek.keys()].sort();
  if (weeks.length < 2) return null;

  const rec = new Map<number, RaceRecord>();
  const out = new Map<number, RaceTeam>();
  let last = new Map<number, number>();
  const bump = (id: number, mine: number, theirs: number, overtime: boolean) => {
    const r = rec.get(id) ?? [0, 0, 0, 0];
    const res = outcomeOf(mine, theirs, overtime, countsOtl);
    r[res === "W" ? 0 : res === "L" ? 1 : res === "T" ? 2 : 3] += 1;
    rec.set(id, r);
  };
  weeks.forEach((wk, i) => {
    for (const g of byWeek.get(wk)!) {
      const overtime = g[8] === 1;
      bump(g[1], g[2]!, g[3]!, overtime);
      bump(g[4], g[3]!, g[2]!, overtime);
    }
    const order = [...rec.entries()].sort(([a, x], [b, y]) =>
      share(y) - share(x) || y[0] - x[0] || (last.get(a) ?? Infinity) - (last.get(b) ?? Infinity) || a - b);
    const now = new Map<number, number>();
    order.forEach(([id], k) => now.set(id, k + 1));
    for (const [id, r] of rec) {
      let t = out.get(id);
      if (!t) { t = { id, ranks: new Array(weeks.length).fill(null), recs: new Array(weeks.length).fill(null) }; out.set(id, t); }
      t.ranks[i] = now.get(id)!;
      t.recs[i] = [...r];
    }
    last = now;
  });
  if (out.size < 2) return null;
  const end = weeks.length - 1;
  return { weeks, teams: [...out.values()].sort((a, b) => a.ranks[end]! - b.ranks[end]! || a.id - b.id) };
}

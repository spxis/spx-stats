import type { StandingRow } from "./api/types";
import type { Speaker } from "./i18n/i18n";
import type { PhraseKey } from "./i18n/phrases.constants";

type Why = "lockout" | "strike" | "strikeStart" | "pandemic" | "war";

/** A league-wide season that was not the usual length: the games each team was meant to play, the usual, and why (source: Wikipedia). */
interface ShortSeason { lg: string; year: number; games: number; usual: number; why: Why; src: string }

const wiki = (page: string) => `https://en.wikipedia.org/wiki/${page}`;

export const SHORT_SEASONS: ShortSeason[] = [
  { lg: "nhl", year: 1994, games: 48, usual: 84, why: "lockout", src: wiki("1994%E2%80%9395_NHL_season") },
  { lg: "nhl", year: 2012, games: 48, usual: 82, why: "lockout", src: wiki("2012%E2%80%9313_NHL_season") },
  { lg: "nhl", year: 2019, games: 82, usual: 82, why: "pandemic", src: wiki("2019%E2%80%9320_NHL_season") },
  { lg: "nhl", year: 2020, games: 56, usual: 82, why: "pandemic", src: wiki("2020%E2%80%9321_NHL_season") },
  { lg: "nba", year: 1998, games: 50, usual: 82, why: "lockout", src: wiki("1998%E2%80%9399_NBA_season") },
  { lg: "nba", year: 2011, games: 66, usual: 82, why: "lockout", src: wiki("2011%E2%80%9312_NBA_season") },
  { lg: "nba", year: 2019, games: 82, usual: 82, why: "pandemic", src: wiki("2019%E2%80%9320_NBA_season") },
  { lg: "nba", year: 2020, games: 72, usual: 82, why: "pandemic", src: wiki("2020%E2%80%9321_NBA_season") },
  { lg: "mlb", year: 1918, games: 154, usual: 154, why: "war", src: wiki("1918_Major_League_Baseball_season") },
  { lg: "mlb", year: 1972, games: 162, usual: 162, why: "strikeStart", src: wiki("1972_Major_League_Baseball_season") },
  { lg: "mlb", year: 1981, games: 162, usual: 162, why: "strike", src: wiki("1981_Major_League_Baseball_season") },
  { lg: "mlb", year: 1994, games: 162, usual: 162, why: "strike", src: wiki("1994_Major_League_Baseball_season") },
  { lg: "mlb", year: 1995, games: 144, usual: 162, why: "strikeStart", src: wiki("1995_Major_League_Baseball_season") },
  { lg: "mlb", year: 2020, games: 60, usual: 162, why: "pandemic", src: wiki("2020_Major_League_Baseball_season") },
  { lg: "cfl", year: 2021, games: 14, usual: 18, why: "pandemic", src: wiki("2021_CFL_season") },
];

const WHY: Record<Why, PhraseKey> = {
  lockout: "sched.why.lockout", strike: "sched.why.strike", strikeStart: "sched.why.strikeStart", pandemic: "sched.why.pandemic", war: "sched.why.war",
};

/**
 * The usual length of a league's season: the games count most teams share, when at least half the teams share it.
 * An unfinished season (no champion yet) has none.
 */
export function usualGames(gps: number[], complete: boolean): number | null {
  if (!complete || !gps.length) return null;
  const n = new Map<number, number>();
  for (const g of gps) n.set(g, (n.get(g) ?? 0) + 1);
  const [mode, count] = [...n].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  return count * 2 >= gps.length ? mode : null;
}

export interface ScheduleNote { text: string; src: string | null }

/**
 * Why a schedule has fewer games than a full season, or null when it does not. A league-wide short season comes from SHORT_SEASONS
 * with its reason; any other season is compared with the usual length. A team that played under half of it (a team that folded,
 * a gap in the data) is not called short. With `team` it is that team's note, otherwise the season's.
 */
export function scheduleNote(say: Speaker["say"], plural: Speaker["plural"], lg: string, year: number, standings: StandingRow[], complete: boolean, team?: { name: string; played: number | null }): ScheduleNote | null {
  const gps = standings.map((r) => r.gp ?? 0).filter((g) => g > 0);
  const typed = SHORT_SEASONS.find((s) => s.lg === lg && s.year === year);
  const target = typed ? typed.games : usualGames(gps, complete);
  if (target == null) return null;
  const parts: string[] = [];
  if (typed) {
    parts.push(say(WHY[typed.why]));
    if (typed.games < typed.usual) parts.push(say("sched.fewer", { games: typed.games, usual: typed.usual }));
  }
  if (team) {
    const p = team.played;
    if (p != null && p < target && p * 2 >= target) parts.push(say(typed ? "sched.teamPlayed" : "sched.teamUsual", { team: team.name, played: p, games: target }));
  } else {
    const real = gps.filter((g) => g * 2 >= target);
    const min = Math.min(...real);
    if (real.length && min < target) {
      if (typed) parts.push(say("sched.range", { min, max: Math.max(...real), games: target }));
      else parts.push(plural("sched.fewTeams", real.filter((g) => g < target).length, { usual: target, min }));
    }
  }
  if (!parts.length) return null;
  return { text: parts.join(say("sentence.gap")), src: typed?.src ?? null };
}

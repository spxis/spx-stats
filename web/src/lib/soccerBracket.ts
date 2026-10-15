import type { Tie, TiePlay } from "./bracketLayout.ts";
import type { Match } from "./soccer.ts";
import { gameOrder, inOrder } from "./sides.ts";
import { goalsOf } from "./soccerH2H.ts";

/**
 * A tournament's knockout rounds as ties for the bracket layout (lib/bracketLayout.ts). A tie is the match two teams played in a stage; a drawn
 * match that was replayed (1934 and 1938) is one tie of two matches, decided by the replay, so the bracket draws one box for it. The
 * third-place match leads nowhere, so it is returned apart and the bracket never sees it. Pure.
 */
export interface SoccerTie extends Tie<string> {
  /** The stage the tie was played in (stage_key). */
  stage_key: string;
  /** Its matches, oldest first (more than one only for a replay); the last one decided it. */
  matches: Match[];
}

/**
 * How a tie was played, in the bracket package's words: its matches oldest first, each as the goals of `side` and of the other team (extra time included,
 * a shoot-out apart, in the same order). A drawn match that was replayed (1934, 1938) gives the replay a game of its own, flagged, which settles the tie.
 */
export function soccerPlay(ms: readonly Match[], side: string): TiePlay {
  const games = ms.map((m, i) => {
    const [a, b] = goalsOf(m, side);
    const pens: readonly [number, number] | null = m.shootout && m.home_penalties != null && m.away_penalties != null
      ? (m.home_team_id === side ? [m.home_penalties, m.away_penalties] : [m.away_penalties, m.home_penalties]) : null;
    return { score: [a, b] as const, date: m.match_date, ...(m.extra_time ? { extraTime: true } : {}), ...(pens ? { pens } : {}), ...(i > 0 ? { replay: true } : {}) };
  });
  return ms.length > 1 ? { kind: "replay", games } : { kind: "game", games };
}

export interface Knockout {
  ties: SoccerTie[];
  /** The round of each tie (1 = the first knockout round, rising to the final), as lib/bracketLayout.ts takes them. */
  round: number[];
  /** The stage of each round: round r is `stages[r - 1]`. */
  stages: string[];
  /** The third-place match, shown apart. */
  third: Match | null;
}

/** A match's two teams as a tie draws them, in the site's order for one game (lib/sides.ts): the visitor first, then the home team. */
export function matchSides(m: Pick<Match, "home_team_id" | "away_team_id" | "winner_team_id">): readonly [string, string] {
  const winner = m.winner_team_id === m.home_team_id ? 0 : m.winner_team_id === m.away_team_id ? 1 : null;
  return inOrder(gameOrder(0, winner), [m.home_team_id, m.away_team_id]);
}

/** The knockout matches of one tournament (the group stages come before stage_order 4). */
export function knockoutOf(matches: readonly Match[]): Knockout {
  const ko = matches.filter((m) => m.stage_order >= 4).sort((x, y) => x.match_date.localeCompare(y.match_date) || x.match_id - y.match_id);
  const third = ko.find((m) => m.stage_key === "third_place") ?? null;
  const byTie = new Map<string, Match[]>();
  for (const m of ko) {
    if (m.stage_key === "third_place") continue;
    const key = `${m.stage_key}|${[m.home_team_id, m.away_team_id].sort().join("|")}`;
    byTie.set(key, [...(byTie.get(key) ?? []), m]);
  }
  const ties: SoccerTie[] = [...byTie.values()].map((ms) => {
    const last = ms.at(-1)!;
    const teams = matchSides(last);
    return { teams, winner: last.winner_team_id, start: ms[0].match_date, stage_key: last.stage_key, matches: ms, play: soccerPlay(ms, teams[0]) };
  });
  const order = new Map<string, number>();
  for (const m of ko) if (m.stage_key !== "third_place") order.set(m.stage_key, Math.min(order.get(m.stage_key) ?? Infinity, m.stage_order));
  const stages = [...order].sort((a, b) => a[1] - b[1]).map(([key]) => key);
  return { ties, round: ties.map((t) => stages.indexOf(t.stage_key) + 1), stages, third };
}

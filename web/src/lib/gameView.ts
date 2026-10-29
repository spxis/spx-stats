/**
 * What a game's page works out from the games around it: each club's record going in, the games on either side of it, the form, and how the two clubs
 * have fared against each other. Pure (the page fetches, this adds up) so the page and scripts/game.test.ts count the same way.
 */
import type { GameRow } from "./api/types";

/** The columns of a game this file reads. */
export type Lite = Pick<GameRow, "game_id" | "game_date" | "phase" | "status" | "away_id" | "away" | "away_score" | "home_id" | "home" | "home_score" | "overtime">;
/** A game between two franchises: the meetings of a pair across seasons. */
export type PairGame = Lite & Pick<GameRow, "year" | "away_f" | "home_f">;

/** Whether a game has a final result on record. */
export const isFinal = (g: Pick<Lite, "status" | "home_score" | "away_score">): boolean => g.status === "final" && g.home_score != null && g.away_score != null;

const before = (x: Pick<Lite, "game_date" | "game_id">, y: Pick<Lite, "game_date" | "game_id">): number =>
  x.game_date < y.game_date ? -1 : x.game_date > y.game_date ? 1 : x.game_id - y.game_id;
/** Orders games as they were played (the day, then the id). */
export const inOrder = <T extends Pick<Lite, "game_date" | "game_id">>(list: readonly T[]): T[] => [...list].sort(before);

/** Hockey counted a loss in overtime as its own result from 1999-2000 on (the NHL gave the loser a point). */
export const countsOtl = (lg: string, year: number): boolean => lg === "nhl" && year >= 1999;

export type Result = "W" | "L" | "T" | "OTL";

/** A club's result in a game it played, or null when the game has no result (or the club did not play in it). `team` is the club's id in the season. */
export function resultFor(g: Lite, team: number, otl: boolean): Result | null {
  if (!isFinal(g) || (g.home_id !== team && g.away_id !== team)) return null;
  const mine = g.home_id === team ? g.home_score! : g.away_score!, theirs = g.home_id === team ? g.away_score! : g.home_score!;
  return mine > theirs ? "W" : mine < theirs ? (g.overtime && otl ? "OTL" : "L") : "T";
}

export interface Tally { gp: number; w: number; l: number; t: number; otl: number }

export const emptyTally = (): Tally => ({ gp: 0, w: 0, l: 0, t: 0, otl: 0 });

/** The record of a club over some games (those it played with a result). */
export function tallyOf(games: readonly Lite[], team: number, otl: boolean): Tally {
  const t = emptyTally();
  for (const g of games) {
    const r = resultFor(g, team, otl);
    if (!r) continue;
    t.gp++;
    if (r === "W") t.w++; else if (r === "L") t.l++; else if (r === "T") t.t++; else t.otl++;
  }
  return t;
}

/** A club's games in the order played, from the games of the season the page read (both clubs'). Preseason and all-star games are left out unless `keep` is that phase. */
export function timelineOf(games: readonly Lite[], team: number, keep?: string): Lite[] {
  return inOrder(games.filter((g) => (g.home_id === team || g.away_id === team) && (g.phase === "regular" || g.phase === "playoffs" || g.phase === keep)));
}

/** The games either side of one in a timeline (null at the ends). */
export function around<T extends Lite>(timeline: readonly T[], game: Pick<Lite, "game_id">): { prev: T | null; next: T | null; index: number } {
  const i = timeline.findIndex((g) => g.game_id === game.game_id);
  return i < 0 ? { prev: null, next: null, index: -1 } : { prev: timeline[i - 1] ?? null, next: timeline[i + 1] ?? null, index: i };
}

export interface Going {
  /** The record of this part of the season (the game's own phase) before the game. */
  before: Tally;
  /** The same record with the game, when it has a result. */
  after: Tally;
  /** The number the game is among the club's games of this phase (1 is the first). */
  number: number;
  /** The club's regular season in full (what a playoff game follows), or null for a regular-season game. */
  season: Tally | null;
}

/**
 * A club's record going into a game and coming out of it. `timeline` is `timelineOf` for the club; the game is in it. `whole`: the record is the whole season's
 * (a bowl game follows the regular season in one record, as in college football, where the overall record counts the bowl) and not the game's own phase's.
 */
export function goingInto(timeline: readonly Lite[], game: Lite, team: number, otl: boolean, whole = false): Going {
  const same = whole ? timeline : timeline.filter((g) => g.phase === game.phase);
  const i = same.findIndex((g) => g.game_id === game.game_id);
  const prior = i < 0 ? same : same.slice(0, i);
  const done = i < 0 ? same : same.slice(0, i + 1);
  return {
    before: tallyOf(prior, team, otl),
    after: tallyOf(done, team, otl),
    number: i < 0 ? prior.length + 1 : i + 1,
    season: game.phase === "playoffs" ? tallyOf(timeline.filter((g) => g.phase === "regular"), team, otl) : null,
  };
}

/** The club's last `n` results before a game, oldest first: the game, and how it went. */
export function formBefore(timeline: readonly Lite[], game: Lite, team: number, otl: boolean, n = 5): { game: Lite; result: Result }[] {
  const i = timeline.findIndex((g) => g.game_id === game.game_id);
  const prior = i < 0 ? timeline : timeline.slice(0, i);
  const out: { game: Lite; result: Result }[] = [];
  for (const g of prior) {
    const result = resultFor(g, team, otl);
    if (result) out.push({ game: g, result });
  }
  return out.slice(-n);
}

/** The meetings of a pair on either side of a game: the one before it and the one after it (null when there is none). `history` is every game of the pair. */
export function meetingsAround<T extends Lite>(history: readonly T[], game: Pick<Lite, "game_id" | "game_date">): { prev: T | null; next: T | null } {
  let prev: T | null = null, next: T | null = null;
  for (const g of inOrder(history)) {
    if (g.game_id === game.game_id) continue;
    if (before(g, game) < 0) prev = g;
    else if (!next) next = g;
  }
  return { prev, next };
}

export interface Head {
  /** Games with a result between the two franchises. */
  gp: number;
  /** Wins of franchise `a` and of franchise `b`; ties (and, for hockey after 1998, overtime losses, which are wins for the other side) are in `t`. */
  a: number;
  b: number;
  t: number;
  /** Goals, runs or points each side scored. */
  af: number;
  bf: number;
}

/** The record of franchise `a` against franchise `b` over some of their games (those with a result between exactly the two). */
export function headOf(history: readonly PairGame[], a: number, b: number): Head {
  const h: Head = { gp: 0, a: 0, b: 0, t: 0, af: 0, bf: 0 };
  for (const g of history) {
    if (!isFinal(g)) continue;
    const aHome = g.home_f === a && g.away_f === b;
    if (!aHome && !(g.away_f === a && g.home_f === b)) continue;
    const x = aHome ? g.home_score! : g.away_score!, y = aHome ? g.away_score! : g.home_score!;
    h.gp++;
    h.af += x;
    h.bf += y;
    if (x > y) h.a++; else if (x < y) h.b++; else h.t++;
  }
  return h;
}

/** The meetings of the pair in one season, in the order played. */
export const inSeason = (history: readonly PairGame[], year: number): PairGame[] => inOrder(history.filter((g) => g.year === year));

/**
 * Two franchises head to head, worked out from the games they played each other. Pure: the page fetches, this adds up.
 * A franchise is the unit (a renamed club is the same side); each game keeps the names the clubs wore that season.
 * Side 0 ("a") is the franchise whose address comes first alphabetically; every record here is from its point of view.
 */
import { z } from "zod";
import type { GameRow } from "./api/types";
import { parseLoc, type Loc, type Rec } from "./loc";
import { resultSchema, type ResultFilter } from "./resultFilter";
import { meetingsOf, type PlayoffGame, type Series } from "./series";
import { parseSeasonSeg, type TeamPaths } from "./slug";

export type H2hPhase = "all" | "regular" | "playoffs";
export type H2hResult = "W" | "L" | "T" | "OTL";

export interface H2hGame {
  id: number;
  date: string;
  year: number;
  ph: "regular" | "playoffs";
  /** Whether side a was the home team. */
  aHome: boolean;
  awayName: string;
  homeName: string;
  awayScore: number;
  homeScore: number;
  /** Side a's score and side b's score. */
  a: number;
  b: number;
  /** The game from side a's point of view. */
  res: H2hResult;
  ot: boolean;
  src: string;
}

/** Hockey counted a loss in overtime as its own result from 1999-2000 on (the NHL gave the loser a point). */
export const otlEra = (lg: string, year: number): boolean => lg === "nhl" && year >= 1999;

/** Both sides' games between two franchises that have a result, in the order played. Preseason and all-star games are not part of a rivalry. */
export function h2hGames(lg: string, games: readonly GameRow[], a: number, b: number): H2hGame[] {
  const out: H2hGame[] = [];
  for (const g of games) {
    if (g.phase !== "regular" && g.phase !== "playoffs") continue;
    const aHome = g.home_f === a && g.away_f === b;
    if (!aHome && !(g.away_f === a && g.home_f === b)) continue;
    if (g.status !== "final" || g.home_score == null || g.away_score == null) continue;
    const sa = aHome ? g.home_score : g.away_score, sb = aHome ? g.away_score : g.home_score;
    const ot = !!g.overtime;
    out.push({
      id: g.game_id, date: g.game_date, year: g.year, ph: g.phase === "playoffs" ? "playoffs" : "regular", aHome,
      awayName: g.away ?? "", homeName: g.home ?? "", awayScore: g.away_score, homeScore: g.home_score,
      a: sa, b: sb, res: sa > sb ? "W" : sa < sb ? (ot && otlEra(lg, g.year) ? "OTL" : "L") : "T", ot, src: g.source,
    });
  }
  return out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.id - y.id));
}

export interface Tally {
  gp: number;
  a: Rec;
  b: Rec;
  /** What side a scored and what side b scored. */
  af: number;
  bf: number;
}

export const emptyTally = (): Tally => ({ gp: 0, a: { w: 0, l: 0, t: 0, otl: 0 }, b: { w: 0, l: 0, t: 0, otl: 0 }, af: 0, bf: 0 });

/** The record of both sides over some games. An overtime loss (in the seasons that count them) is the loser's `otl`, not `l`. */
export function tally(list: readonly H2hGame[], lg: string): Tally {
  const t = emptyTally();
  for (const g of list) {
    t.gp++;
    t.af += g.a;
    t.bf += g.b;
    const ot = g.ot && otlEra(lg, g.year);
    if (g.res === "W") { t.a.w++; if (ot) t.b.otl++; else t.b.l++; }
    else if (g.res === "T") { t.a.t++; t.b.t++; }
    else { t.b.w++; if (g.res === "OTL") t.a.otl++; else t.a.l++; }
  }
  return t;
}

export interface Season {
  year: number;
  t: Tally;
  /** The names the two clubs went by that season. */
  aName: string;
  bName: string;
}

/** One row per season in which the pair played, oldest first. */
export function bySeason(list: readonly H2hGame[], lg: string): Season[] {
  const by = new Map<number, H2hGame[]>();
  for (const g of list) {
    const l = by.get(g.year);
    if (l) l.push(g); else by.set(g.year, [g]);
  }
  return [...by.entries()].sort((x, y) => x[0] - y[0]).map(([year, games]) => {
    const g = games[games.length - 1];
    return { year, t: tally(games, lg), aName: g.aHome ? g.homeName : g.awayName, bName: g.aHome ? g.awayName : g.homeName };
  });
}

/** How many wins in a row the latest meetings gave one side; `side` is null when the last game was a tie. */
export function streak(list: readonly H2hGame[]): { side: 0 | 1 | null; n: number } | null {
  if (!list.length) return null;
  const who = (g: H2hGame): 0 | 1 | null => (g.res === "T" ? null : g.res === "W" ? 0 : 1);
  const last = who(list[list.length - 1]);
  let n = 0;
  for (let i = list.length - 1; i >= 0 && who(list[i]) === last; i--) n++;
  return { side: last, n };
}

/** The most lopsided win of one side (the latest of equals), or null when it never won. */
export function biggestWin(list: readonly H2hGame[], side: 0 | 1): H2hGame | null {
  let best: H2hGame | null = null;
  let top = 0;
  for (const g of list) {
    const margin = side === 0 ? g.a - g.b : g.b - g.a;
    if (margin > 0 && margin >= top) { best = g; top = margin; }
  }
  return best;
}

/** Wins of a minus wins of b, after each season (cumulative), for the all-time line. */
export function runBySeason(seasons: readonly Season[]): { year: number; diff: number; aw: number; bw: number; t: number }[] {
  let diff = 0;
  return seasons.map((s) => {
    const aw = s.t.a.w, bw = s.t.b.w;
    diff += aw - bw;
    return { year: s.year, diff, aw, bw, t: s.t.a.t };
  });
}

/** Wins of a minus wins of b after each game of a list, in the order played (ties leave it where it was). */
export function runByGame(list: readonly H2hGame[]): { n: number; diff: number; g: H2hGame }[] {
  let diff = 0, n = 0;
  const out: { n: number; diff: number; g: H2hGame }[] = [];
  for (const g of list) {
    n++;
    if (g.res === "W") diff++; else if (g.res !== "T") diff--;
    out.push({ n, diff, g });
  }
  return out;
}

export interface PlayoffMeeting { year: number; s: Series }

/** Every playoff series the pair played (a long gap starts a new one), oldest first. A series with no result is left out. */
export function playoffMeetings(lg: string, games: readonly GameRow[], a: number, b: number): PlayoffMeeting[] {
  const by = new Map<number, PlayoffGame[]>();
  for (const g of games) {
    if (g.phase !== "playoffs" || !((g.home_f === a && g.away_f === b) || (g.home_f === b && g.away_f === a))) continue;
    const l = by.get(g.year);
    if (l) l.push(g); else by.set(g.year, [g]);
  }
  const out: PlayoffMeeting[] = [];
  for (const [year, list] of [...by.entries()].sort((x, y) => x[0] - y[0])) {
    for (const s of meetingsOf(lg, year, list)) if (s.games.some((g) => g.winner != null || g.score[0] != null)) out.push({ year, s });
  }
  return out;
}

/* ---------- the address ---------------------------------------------------------------- */

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** ?season= (a season label, or all), ?phase=, ?loc=, ?result= (the games list only) and ?list=all (every game, not the latest ones). Anything malformed is the default. */
export const h2hQuery = z.object({
  season: z.preprocess(first, z.string().regex(/^\d{4}(-\d{2})?$/)).optional().catch(undefined),
  phase: z.preprocess(first, z.enum(["all", "regular", "playoffs"])).catch("all"),
  loc: z.unknown().transform(parseLoc),
  list: z.preprocess(first, z.enum(["all"])).optional().catch(undefined),
  result: resultSchema,
});

export function parseH2hQuery(sp: Record<string, string | string[] | undefined>, lg: string): { phase: H2hPhase; loc: Loc; result: ResultFilter; list: boolean; year: number | null; canonicalSeason: boolean } {
  const q = h2hQuery.parse({ season: sp.season, phase: sp.phase, loc: sp.loc, list: sp.list, result: sp.result });
  const ys = q.season ? parseSeasonSeg(lg, q.season) : null;
  return { phase: q.phase, loc: q.loc, result: q.result, list: q.list === "all", year: ys ? ys.y : null, canonicalSeason: ys ? ys.canonical : true };
}

/** The address of a pair: `/nhl/head-to-head/boston-bruins-vs-montreal-canadiens`, the franchises in alphabetical order of their slugs. */
export function pairPath(paths: TeamPaths, lg: string, x: number, y: number): { path: string; a: number; b: number } {
  const [a, b] = paths.slug(lg, x) <= paths.slug(lg, y) ? [x, y] : [y, x];
  return { path: `/${lg}/head-to-head/${paths.slug(lg, a)}-vs-${paths.slug(lg, b)}`, a, b };
}

/** A pair's address with a season chosen (the season's label, as in the season addresses). */
export const pairSeasonPath = (path: string, label: string): string => `${path}?season=${label}`;

/** A pair's slug split at "-vs-" into its two team tokens; null when it is not of that shape. */
export function parseH2hSegment(seg: string): { a: string; b: string } | null {
  const m = /^([a-z0-9-]+?)-vs-([a-z0-9-]+)$/.exec(seg);
  return m && m[1] !== m[2] ? { a: m[1], b: m[2] } : null;
}

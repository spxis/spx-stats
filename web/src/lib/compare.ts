/**
 * Two clubs compared side by side, for one season or all-time. Pure: the page fetches, this adds up.
 * Side "a" is the club on the left of the address.
 */
import { z } from "zod";
import type { StandingRow } from "./api/types";
import { byRank, type Placed } from "./alignment";
import { parseSeasonSeg, type TeamPaths } from "./slug";
import { playedInOrder, type TeamGame } from "./teamSeason";

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** ?season= : a season label (2022-23, or 2019 for a one-year league) or `all` for every season. */
export const compareQuery = z.object({
  season: z.preprocess(first, z.string().regex(/^(\d{4}(-\d{2})?|all)$/)).optional().catch(undefined),
});

export interface CompareQuery {
  /** True when the address asks for all-time. */
  all: boolean;
  /** The season asked for; null when none (or all-time). */
  year: number | null;
  /** False when the season is spelled the old way (2022 for 2022-23) and should be redirected. */
  canonicalSeason: boolean;
}

export function parseCompareQuery(sp: Record<string, string | string[] | undefined>, lg: string): CompareQuery {
  const q = compareQuery.parse({ season: sp.season });
  if (q.season === "all") return { all: true, year: null, canonicalSeason: true };
  const ys = q.season ? parseSeasonSeg(lg, q.season) : null;
  return { all: false, year: ys ? ys.y : null, canonicalSeason: ys ? ys.canonical : true };
}

/**
 * The address of a comparison: `/nhl/compare/boston-bruins-vs-florida-panthers`. The franchises are in alphabetical
 * order of their slugs unless `inOrder`, which keeps x on the left (as the page does, so a comparison can be swapped).
 */
export function comparePath(paths: TeamPaths, lg: string, x: number, y: number, inOrder = false): { path: string; a: number; b: number } {
  const [a, b] = inOrder || paths.slug(lg, x) <= paths.slug(lg, y) ? [x, y] : [y, x];
  return { path: `/${lg}/compare/${paths.slug(lg, a)}-vs-${paths.slug(lg, b)}`, a, b };
}

/** A comparison's address with its season (a season label, or `all`). */
export const compareHref = (path: string, season: string): string => `${path}?season=${season}`;

/** Where a club stands among the rows that share its group (a 1-based place and the group's size), by the table's own order. */
export function rankIn(rows: readonly StandingRow[], f: number, same: (r: StandingRow) => boolean): { place: number; of: number } | null {
  const group = rows.filter(same).sort(byRank);
  const i = group.findIndex((r) => r.franchise_id === f);
  return i < 0 ? null : { place: i + 1, of: group.length };
}

export const sameConference = (me: Placed) => (r: Placed) => !!me.conference && r.conference === me.conference;
export const sameDivision = (me: Placed) => (r: Placed) => !!me.division && r.division === me.division && (r.conference ?? "") === (me.conference ?? "");

export interface Streaks {
  /** The longest run of wins and of losses (an overtime loss is a loss; a tie ends both). */
  win: number;
  loss: number;
  /** How the games ended: the result of the last game and how many in a row (W3, L2, T1). */
  last: { res: "W" | "L" | "T"; n: number } | null;
}

/** Streaks over a team's regular-season games with a result, in the order played. */
export function streaksOf(games: readonly TeamGame[]): Streaks {
  const reg = playedInOrder(games.filter((g) => g.ph === "r"));
  let win = 0, loss = 0, w = 0, l = 0;
  let last: Streaks["last"] = null;
  for (const g of reg) {
    const r = g.res === "W" ? "W" : g.res === "T" ? "T" : "L";
    w = r === "W" ? w + 1 : 0;
    l = r === "L" ? l + 1 : 0;
    win = Math.max(win, w);
    loss = Math.max(loss, l);
    last = last && last.res === r ? { res: r, n: last.n + 1 } : { res: r, n: 1 };
  }
  return { win, loss, last };
}

/** Wins minus losses after each regular-season game with a result (an overtime loss is a loss, a tie leaves it), numbered from 1. */
export function runOf(games: readonly TeamGame[]): { n: number; diff: number; g: TeamGame }[] {
  let diff = 0;
  return playedInOrder(games.filter((g) => g.ph === "r")).map((g, i) => {
    if (g.res === "W") diff++; else if (g.res !== "T") diff--;
    return { n: i + 1, diff, g };
  });
}

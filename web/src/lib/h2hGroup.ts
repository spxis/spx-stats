/**
 * A club against a group of clubs: its division, the rest of its conference, the other conferences, or everyone. Pure: the
 * page fetches, this adds up. The groups are those of each season (api.alignment), so a club that changed division is
 * measured against the division it sat in that year.
 */
import type { AlignmentRow } from "./alignment";
import type { GameRow } from "./api/types";
import { otlEra, tally, type H2hResult, type Tally } from "./h2h";
import type { TeamPaths } from "./slug";

export const GROUP_IDS = ["division", "conference", "other-conference", "league"] as const;
export type GroupId = (typeof GROUP_IDS)[number];

/** The address of a club against a group: `/nhl/head-to-head/boston-bruins-vs-division`. */
export const groupPath = (paths: TeamPaths, lg: string, f: number, group: GroupId): string => `/${lg}/head-to-head/${paths.slug(lg, f)}-vs-${group}`;

/** A head-to-head address of the group kind split into the club's token and the group; null for a pair's address. */
export function parseGroupSegment(seg: string): { team: string; group: GroupId } | null {
  const m = /^([a-z0-9-]+?)-vs-(division|conference|other-conference|league)$/.exec(seg);
  return m ? { team: m[1], group: m[2] as GroupId } : null;
}

export type Place = Pick<AlignmentRow, "conference" | "division">;

/** Where each club stood in each season, from the alignment rows: key `year|franchise`. */
export function placeIndex(rows: readonly AlignmentRow[]): Map<string, AlignmentRow> {
  const out = new Map<string, AlignmentRow>();
  for (const r of rows) out.set(`${r.year}|${r.franchise_id}`, r);
  return out;
}

/** Whether an opponent is in the club's group that season. A season the data gives no place for either club has no division or conference. */
export function inGroup(group: GroupId, me: Place | undefined, opp: Place | undefined): boolean {
  if (group === "league") return true;
  if (!me || !opp) return false;
  const sameConf = me.conference != null && opp.conference === me.conference;
  const sameDiv = me.division != null && opp.division === me.division && (opp.conference ?? "") === (me.conference ?? "");
  if (group === "division") return sameDiv;
  if (group === "conference") return sameConf && !sameDiv;
  return me.conference != null && opp.conference != null && opp.conference !== me.conference;
}

/** One game of the club against a member of the group, from the club's point of view. */
export interface GroupGame {
  id: number;
  date: string;
  year: number;
  ph: "regular" | "playoffs";
  /** Whether the club was the home team. */
  aHome: boolean;
  /** The opposing franchise. */
  opp: number;
  /** The club's score and the opponent's. */
  a: number;
  b: number;
  res: H2hResult;
  ot: boolean;
}

/** The club's games against opponents that were in the group that season, in the order played. */
export function groupGames(lg: string, games: readonly GameRow[], f: number, group: GroupId, places: ReadonlyMap<string, Place>): GroupGame[] {
  const out: GroupGame[] = [];
  for (const g of games) {
    if (g.phase !== "regular" && g.phase !== "playoffs") continue;
    if (g.status !== "final" || g.home_score == null || g.away_score == null || g.home_f == null || g.away_f == null) continue;
    const aHome = g.home_f === f;
    if (!aHome && g.away_f !== f) continue;
    const opp = aHome ? g.away_f : g.home_f;
    if (opp === f || !inGroup(group, places.get(`${g.year}|${f}`), places.get(`${g.year}|${opp}`))) continue;
    const sa = aHome ? g.home_score : g.away_score, sb = aHome ? g.away_score : g.home_score;
    const ot = !!g.overtime;
    out.push({
      id: g.game_id, date: g.game_date, year: g.year, ph: g.phase === "playoffs" ? "playoffs" : "regular", aHome, opp, a: sa, b: sb, ot,
      res: sa > sb ? "W" : sa < sb ? (ot && otlEra(lg, g.year) ? "OTL" : "L") : "T",
    });
  }
  return out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.id - y.id));
}

/** One row per season in which the club played the group, oldest first. */
export function seasonTallies(list: readonly GroupGame[], lg: string): { year: number; t: Tally }[] {
  const by = new Map<number, GroupGame[]>();
  for (const g of list) {
    const l = by.get(g.year);
    if (l) l.push(g); else by.set(g.year, [g]);
  }
  return [...by.entries()].sort((x, y) => x[0] - y[0]).map(([year, games]) => ({ year, t: tally(games, lg) }));
}

export interface Member { f: number; t: Tally; years: number[] }

/** The club's record against each member of the group, over the seasons it was one (a member that came and went counts only for those years). */
export function memberTallies(list: readonly GroupGame[], lg: string): Member[] {
  const by = new Map<number, GroupGame[]>();
  for (const g of list) {
    const l = by.get(g.opp);
    if (l) l.push(g); else by.set(g.opp, [g]);
  }
  return [...by.entries()].map(([f, games]) => ({ f, t: tally(games, lg), years: [...new Set(games.map((g) => g.year))].sort((x, y) => x - y) }));
}

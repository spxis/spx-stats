import { layoutBracket, type BracketLayout, type Matchup, type Team } from "@johnmorrisdotca/taisen-brackets/layout";

/**
 * The shape of a knockout bracket, worked out by Taisen Brackets (@johnmorrisdotca/taisen-brackets, MIT; credited in the page's credits): which tie feeds
 * which (a winner goes on to the next tie its side plays), and so which half of the bracket each sits in. Where the sides' conferences split the halves
 * cleanly the halves carry the conference names; otherwise they are plain halves. A tie is a playoff series, a knockout match or anything else two sides
 * contest and one wins (`Tie`), so one layout draws a hockey playoff and a World Cup. This file hands the site's ties to the package, with what the
 * drawing needs of each (the score, the games, the teams' marks), and the layout it returns is what lib/bracketDraw.ts gives the package's `drawBracket`.
 */

/**
 * One tie, as the layout needs it. `teams` are the two sides' keys (a franchise id, a team code), `winner` the key of the side
 * that went through (null while undecided or when nothing settles it), `start` a sortable date that orders ties of one round.
 * The order of `teams` is the order the final's two sides are drawn in (the first side's half is on the left).
 */
export interface Tie<K extends string | number = number> {
  teams: readonly [K, K];
  winner: K | null;
  start: string;
  /** How the tie was played, for the drawing: the score or the games, the length of a series, a shoot-out. Left out, the layout is all there is. */
  play?: TiePlay;
  /** The third-place match: it leads nowhere and is drawn apart. */
  third?: boolean;
}

/** What a drawing shows of a tie besides its sides and winner (the package's own words for it). */
export type TiePlay = Pick<Matchup, "kind" | "bestOf" | "games" | "legs" | "score" | "pens" | "extraTime" | "walkover" | "note" | "home">;

/** What a drawing needs of a side besides its key: the name, the short name, the mark (a logo's address) or flag code, the name in other languages. */
export type SideLook = Omit<Team, "id" | "group">;

export interface Conf { name: string; short: string | null }

export type Bracket = BracketLayout;

/** Western sides read first (left), Eastern last; any other pair by name (American before National, AFC before NFC). */
const rank = (c: Conf) => (/west/i.test(`${c.short} ${c.name}`) ? 0 : /east/i.test(`${c.short} ${c.name}`) ? 2 : 1);

/**
 * `shape` "ltr" draws one tree left to right even where two ties feed the last (one conference's half on its own).
 * `round` is each tie's round (1 = the first knockout round, rising to the final; 0 = a round-robin game, kept out of the tree),
 * in the order of `list`; `confOf` names a side's conference (or null for none: the halves are then plain halves).
 */
export function buildBracket<K extends string | number>(list: readonly Tie<K>[], round: readonly number[], confOf: (side: K) => Conf | null, look: (side: K) => SideLook = (side) => ({ name: String(side) }), shape: "auto" | "ltr" = "auto"): Bracket {
  const { teams, groupOrder } = teamsOf(list, confOf, look);
  return layoutBracket({ matchups: matchupsOf(list, round), teams }, { groupOrder, shape });
}

/** The ties as the package's matchups: `t0`, `t1`... by position, in the order of `list`. */
export const matchupsOf = <K extends string | number>(list: readonly Tie<K>[], round: readonly number[]): Matchup[] =>
  list.map((t, i) => ({ ...t.play, id: `t${i}`, sides: t.teams, winner: t.winner, round: round[i], date: t.start, ...(t.third ? { third: true } : {}) }));

/** Every side once, with its look and the conference it belongs to, and the halves' order (the site's: West before East, any other pair by name). */
export function teamsOf<K extends string | number>(list: readonly Tie<K>[], confOf: (side: K) => Conf | null, look: (side: K) => SideLook = (side) => ({ name: String(side) })): { teams: Team[]; groupOrder: string[] } {
  const confs = new Map<K, Conf>();
  for (const t of list) for (const side of t.teams) { const c = confOf(side); if (c && !confs.has(side)) confs.set(side, c); }
  const teams: Team[] = [...new Set(list.flatMap((t) => t.teams))].map((id) => ({ id, ...look(id), ...(confs.has(id) ? { group: confs.get(id)!.name } : {}) }));
  const byName = new Map<string, Conf>([...confs.values()].map((c) => [c.name, c]));
  const groupOrder = [...byName.values()].sort((a, b) => rank(a) - rank(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).map((c) => c.name);
  return { teams, groupOrder };
}

/**
 * The halves of a season's bracket by franchise: the conference, or, in a season that has divisions and no conferences (the NHL's East and West Divisions of
 * 1967 to 1973), the division. The CFL's East and West are its divisions, and the halves are called so ("East Division").
 */
export function halvesOf(lg: string, align: readonly { franchise_id: number; conference: string | null; conference_short: string | null; division: string | null; division_short: string | null }[]): Map<number, Conf> {
  const hasConf = align.some((a) => a.conference);
  const pick = (a: (typeof align)[number]): Conf | null => {
    if (a.conference) return { name: lg === "cfl" && !/division/i.test(a.conference) ? `${a.conference} Division` : a.conference, short: a.conference_short ?? a.conference };
    return !hasConf && a.division ? { name: a.division, short: a.division_short } : null;
  };
  return new Map(align.flatMap((a) => { const c = pick(a); return c ? [[a.franchise_id, c] as const] : []; }));
}

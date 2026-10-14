import { layoutBracket, type BracketLayout, type LayoutBox, type LayoutSide, type Matchup, type Team } from "@johnmorrisdotca/taisen-brackets/layout";

/**
 * The shape of a knockout bracket, worked out by Taisen Brackets (@johnmorrisdotca/taisen-brackets, MIT; credited in the footer's credits): which tie feeds
 * which (a winner goes on to the next tie its side plays), and so which half of the bracket each sits in. Where the sides' conferences split the halves
 * cleanly the halves carry the conference names; otherwise they are plain halves. A tie is a playoff series, a knockout match or anything else two sides
 * contest and one wins (`Tie`), so one layout draws a hockey playoff and a World Cup. This file only hands the site's ties to the package and keeps the
 * shape components/BracketFrame.tsx draws (the final always in the middle, even when nothing feeds it); the package's own drawing (`drawBracket`) is a
 * picture with no link in a box, and every box here links to its series or match page, so it is not used.
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
}

export interface Conf { name: string; short: string | null }

export type Bracket = BracketLayout;
export type BracketSide = LayoutSide;
export type Box = LayoutBox;

/** Western sides read first (left), Eastern last; any other pair by name (American before National, AFC before NFC). */
const rank = (c: Conf) => (/west/i.test(`${c.short} ${c.name}`) ? 0 : /east/i.test(`${c.short} ${c.name}`) ? 2 : 1);

/**
 * `round` is each tie's round (1 = the first knockout round, rising to the final; 0 = a round-robin game, kept out of the tree),
 * in the order of `list`; `confOf` names a side's conference (or null for none: the halves are then plain halves).
 */
export function buildBracket<K extends string | number>(list: readonly Tie<K>[], round: readonly number[], confOf: (side: K) => Conf | null): Bracket {
  const matchups: Matchup[] = list.map((t, i) => ({ id: `t${i}`, sides: t.teams, winner: t.winner, round: round[i], date: t.start }));
  const confs = new Map<K, Conf>();
  for (const t of list) for (const side of t.teams) { const c = confOf(side); if (c && !confs.has(side)) confs.set(side, c); }
  const teams: Team[] = [...new Set(list.flatMap((t) => t.teams))].map((id) => ({ id, name: String(id), ...(confs.has(id) ? { group: confs.get(id)!.name } : {}) }));
  // The halves' order is the site's: West before East, any other pair by name.
  const byName = new Map<string, Conf>([...confs.values()].map((c) => [c.name, c]));
  const groupOrder = [...byName.values()].sort((a, b) => rank(a) - rank(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).map((c) => c.name);
  const layout = layoutBracket({ matchups, teams }, { groupOrder });
  return finalInTheMiddle(layout, (t) => t.teams.map(confOf) as [Conf | null, Conf | null], list);
}

/**
 * The package lays a final that nothing feeds (a tournament whose only knockout match is the final) out as a tree of its own beside any other. The site draws
 * every final in the middle, under its own heading, and any tie outside the final's tree apart from it, so that tie is made the final and the rest leave the sides.
 */
function finalInTheMiddle<K extends string | number>(layout: BracketLayout, confsOf: (t: Tie<K>) => [Conf | null, Conf | null], list: readonly Tie<K>[]): BracketLayout {
  const fin = layout.finalIndex;
  if (fin === null || layout.final !== null) return layout;
  const other = layout.ties.filter((t) => t.round > 0 && t.index !== fin).map((t) => t.index);
  const place = layout.place.map((p, i) => (i === fin ? "f" : other.includes(i) ? "o" : p));
  // As the halves are read, the side from the western conference is drawn on top.
  const [ca, cb] = confsOf(list[fin]);
  const swap = ca && cb && ca.name !== cb.name && (rank(ca) > rank(cb) || (rank(ca) === rank(cb) && ca.name > cb.name));
  return { ...layout, sides: [], columns: [], rows: 1, other, place, final: { i: fin, y: 0, order: swap ? [1, 0] : [0, 1] } };
}

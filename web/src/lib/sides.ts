/**
 * Which team is on the left and which on the right, decided in this one file for the whole site: the banner of a series and of a game, the surface a game is
 * drawn on, the team panels, and the boxes of a bracket. Pure (no server-only imports): the pages and the checks share it.
 *
 * The rule (`SIDE_RULE`, one constant, "home" today):
 * - **a single game**: the order of the sport's own listing. The North American leagues (NHL, NBA, MLB, NFL, CFL) list the visitor first ("Bruins at Canadiens"), so the
 *   visitor is on the left and the home team on the right, the scoreboard's order. Soccer lists the home side first (Arsenal 2–1 Chelsea; FIFA lists its designated home
 *   "Team A" first, even at a neutral ground: "Argentina v France"), so the home side (the stored `home`, FIFA's Team A) is on the left (`HOME_FIRST`, `isHomeFirst`);
 * - **a series**: the team that had home advantage on the left, the other on the right. Home advantage is the home side of the series' first game (the higher seed has
 *   it in every format here, and the archive holds no seeds); a series of one game is a game, so the visitor is on the left;
 * - **a page about a series that draws its deciding game** (the series page, the champion's surface) puts the deciding game's teams in the series' order, not the game's
 *   own: the banner and the surface under it must not swap sides (game 7 is at home for the side that is on the left of the banner).
 *
 * "winner" would put the winner on the left and the other on the right (the order `Series.sides` is already in). Everything that draws two teams side by side asks
 * the functions below, so changing `SIDE_RULE` changes the site.
 */
import type { Series } from "./series.ts";

export type SideRule = "home" | "winner";
export const SIDE_RULE: SideRule = "home";

/** The sports that list the home side first (and draw it on the left); every other sport lists the visitor first. The names are the callers' `sport` argument. */
export const HOME_FIRST: readonly string[] = ["soccer"];
export const isHomeFirst = (sport?: string | null): boolean => sport != null && HOME_FIRST.includes(sport);

/** The indexes of a pair's two sides, left one first: `[0, 1]` as they stand, `[1, 0]` swapped. */
export type Order = readonly [0 | 1, 0 | 1];
const AS_IS: Order = [0, 1];
const SWAPPED: Order = [1, 0];

/** Where a side is: 0 for the left, 1 for the right. */
export const placeOf = (order: Order, side: 0 | 1): 0 | 1 => (order[0] === side ? 0 : 1);

/**
 * The order of the two sides of one game: `home` is the index of the home side (0 or 1), `winner` the index of the side that won (null for a draw or a game not played),
 * `sport` the sport ("soccer" lists the home side first; anything else, or none, the visitor first).
 */
export function gameOrder(home: 0 | 1, winner: 0 | 1 | null = null, rule: SideRule = SIDE_RULE, sport?: string | null): Order {
  if (rule === "winner" && winner != null) return winner === 0 ? AS_IS : SWAPPED;
  const homeLeft = isHomeFirst(sport);
  return (home === 0) !== homeLeft ? SWAPPED : AS_IS;
}

/**
 * The order of the two sides of a series, as indexes into `Series.sides`. Under "home" the side that was at home in the first game is on the left; a series of one
 * game is that game (the visitor on the left). Under "winner" the order is the one `Series.sides` is in, the winner first (the side ahead, in a series in progress).
 */
export function seriesOrder(s: Pick<Series, "games">, rule: SideRule = SIDE_RULE): Order {
  const first = s.games[0];
  if (!first || rule === "winner") return AS_IS;
  return s.games.length === 1 ? gameOrder(first.home, first.winner, rule) : first.home === 0 ? AS_IS : SWAPPED;
}

/** The two things in the order given: `[x[order[0]], x[order[1]]]`. */
export const inOrder = <T>(order: Order, pair: readonly [T, T]): [T, T] => [pair[order[0]], pair[order[1]]];

/**
 * A game's two teams as the left and the right of a drawing. `leftOf` says whether a team is the one that stands on the left of the series the game belongs to; when it picks
 * one of the two, that team is on the left whichever side of the game it was, otherwise the game's own order. `swapped` says that the left team is the home team.
 */
export function leftRight<T>(away: T, home: T, opts: { winner?: "away" | "home" | null; leftOf?: (team: T) => boolean; rule?: SideRule; sport?: string | null } = {}): { left: T; right: T; swapped: boolean } {
  const { winner = null, leftOf, rule = SIDE_RULE, sport } = opts;
  const order: Order = leftOf && leftOf(away) !== leftOf(home)
    ? (leftOf(away) ? AS_IS : SWAPPED)
    : gameOrder(1, winner === "away" ? 0 : winner === "home" ? 1 : null, rule, sport);
  const [left, right] = inOrder(order, [away, home]);
  return { left, right, swapped: order[0] === 1 };
}

/** What a pair of side names says about which is on the left of a game with no home side: West, then everything else, then East (the order of bracketLayout's halves). */
const neutralRank = (name: string): number => (/west/i.test(name) ? 0 : /east/i.test(name) ? 2 : 1);

/**
 * The order of the two sides of a game that has no home side (an All-Star Game between East and West, the American and the National League): the western side on the left,
 * the eastern on the right, any other pair by name (American before National, AFC before NFC, Team A before Team B), the same order the halves of a bracket read in. A game with
 * a host club on one side goes through `gameOrder` instead (the host is the home side). The order never depends on who won or on the order a list prints the sides in.
 */
export function neutralOrder(a: string, b: string): Order {
  const d = neutralRank(a) - neutralRank(b);
  if (d) return d < 0 ? AS_IS : SWAPPED;
  return a.localeCompare(b, "en", { sensitivity: "base" }) <= 0 ? AS_IS : SWAPPED;
}

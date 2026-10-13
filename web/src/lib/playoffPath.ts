/**
 * The path every club took through a season's playoffs, as the blocks and bands of a Sankey diagram: the pure part (no Next imports, so a
 * node script can test it). The columns run: every club of the regular season, "made the playoffs" or "missed them", each round (one block
 * per series) and the champion. A club is one band all the way, a band of its own colour: it enters its first series, and the winner of a
 * series carries on into the next one; the loser's band ends in the series it lost.
 */
import type { Series } from "./series.ts";

export interface PathClub {
  f: number;
  /** Place in the regular season, 1 = best (clubs are given best first). */
  place: number;
}

export type PathNodeKind = "team" | "in" | "out" | "series" | "champion";

export interface PathNode {
  id: string;
  kind: PathNodeKind;
  column: number;
  order: number;
  /** The club of a team or champion block. */
  f?: number;
  /** Index into the series list. */
  series?: number;
  /** For a club: the last round it played (0 when it missed the playoffs). */
  reached?: number;
}

export type PathLinkKind = "qualify" | "miss" | "enter" | "advance" | "title";

export interface PathLink {
  id: string;
  kind: PathLinkKind;
  source: string;
  target: string;
  /** The club the band belongs to. */
  f: number;
  /** The series the band leads into or comes out of. */
  series?: number;
}

export interface PathRoute {
  f: number;
  nodes: string[];
  links: string[];
}

export interface PathGraph {
  nodes: PathNode[];
  links: PathLink[];
  routes: PathRoute[];
  /** Columns drawn: clubs, in/out, one per round, and the champion's when the final was decided. */
  columns: number;
  /** The club that won the last series, when there is one final and it was decided. */
  champion: number | null;
  /** Per club: the series it played, in order, as indexes into the series list. */
  played: Map<number, number[]>;
}

export const teamId = (f: number) => `t${f}`;
export const seriesId = (i: number) => `s${i}`;
export const IN = "in", OUT = "out", CHAMPION = "champ";

/**
 * @param series  the season's series
 * @param round   the round of each series (1.., 0 for a round robin, which is not part of the bracket)
 * @param clubs   every club of the season, best first
 * @param final   the round that holds the one final, or 0 when the last round holds more than one series
 */
export function pathGraph(series: readonly Series[], round: readonly number[], clubs: readonly PathClub[], final: number): PathGraph {
  const inBracket = series.map((_, i) => i).filter((i) => round[i] > 0);
  const rounds = Math.max(0, ...inBracket.map((i) => round[i]));
  const played = new Map<number, number[]>();
  for (const i of inBracket.sort((a, b) => round[a] - round[b] || a - b)) {
    for (const side of series[i].sides) played.set(side.f, [...(played.get(side.f) ?? []), i]);
  }
  const won = (i: number, f: number) => series[i].winner != null && series[i].sides[0].f === f;
  const finalIdx = final > 0 ? inBracket.find((i) => round[i] === final) ?? null : null;
  const champion = finalIdx != null && series[finalIdx].winner != null ? series[finalIdx].sides[0].f : null;

  // Every club of the season, plus any club that played a series but has no standings row.
  const known = new Set(clubs.map((c) => c.f));
  const all: PathClub[] = [...clubs, ...[...played.keys()].filter((f) => !known.has(f)).map((f) => ({ f, place: Infinity }))];
  const reach = (f: number) => {
    const list = played.get(f) ?? [];
    return list.length ? round[list[list.length - 1]] : 0;
  };
  const ranked = [...all].sort((a, b) => (a.f === champion ? -1 : b.f === champion ? 1 : 0) || reach(b.f) - reach(a.f) || a.place - b.place || a.f - b.f);
  const teamOrder = new Map(ranked.map((c, i) => [c.f, i]));

  const nodes: PathNode[] = ranked.map((c) => ({ id: teamId(c.f), kind: "team", column: 0, order: teamOrder.get(c.f)!, f: c.f, reached: reach(c.f) }));
  const qualified = ranked.some((c) => played.has(c.f)), missed = ranked.some((c) => !played.has(c.f));
  if (qualified) nodes.push({ id: IN, kind: "in", column: 1, order: 0 });
  if (missed) nodes.push({ id: OUT, kind: "out", column: 1, order: 1 });
  // A series sits near what feeds it: the clubs that play it (the first series of a club), else the series they won to get there.
  const at = new Map<string, number>();
  const norm = (i: number, n: number) => (n > 1 ? i / (n - 1) : 0.5);
  ranked.forEach((c, i) => at.set(teamId(c.f), norm(i, ranked.length)));
  for (let r = 1; r <= rounds; r++) {
    const here = inBracket.filter((i) => round[i] === r);
    const feed = (i: number) => {
      const spots = series[i].sides.map((side) => {
        const list = played.get(side.f) ?? [];
        const k = list.indexOf(i);
        return at.get(k > 0 ? seriesId(list[k - 1]) : teamId(side.f)) ?? 0;
      });
      return spots.reduce((x, y) => x + y, 0) / spots.length;
    };
    here.sort((a, b) => feed(a) - feed(b) || a - b);
    here.forEach((i, k) => {
      at.set(seriesId(i), norm(k, here.length));
      nodes.push({ id: seriesId(i), kind: "series", column: r + 1, order: k, series: i });
    });
  }
  if (champion != null) nodes.push({ id: CHAMPION, kind: "champion", column: rounds + 2, order: 0, f: champion });

  const links: PathLink[] = [];
  const routes: PathRoute[] = [];
  for (const c of ranked) {
    const mine = played.get(c.f) ?? [];
    if (!mine.length) {
      const id = `m${c.f}`;
      links.push({ id, kind: "miss", source: teamId(c.f), target: OUT, f: c.f });
      routes.push({ f: c.f, nodes: [teamId(c.f), OUT], links: [id] });
      continue;
    }
    const routeNodes = [teamId(c.f), IN], routeLinks: string[] = [];
    const q = `q${c.f}`;
    links.push({ id: q, kind: "qualify", source: teamId(c.f), target: IN, f: c.f });
    routeLinks.push(q);
    let from = IN;
    let last = -1;
    for (let n = 0; n < mine.length; n++) {
      const i = mine[n];
      const kind: PathLinkKind = n === 0 ? "enter" : "advance";
      const id = `${n === 0 ? "e" : "a"}${c.f}-${n}`;
      links.push({ id, kind, source: from, target: seriesId(i), f: c.f, series: i });
      routeLinks.push(id);
      routeNodes.push(seriesId(i));
      from = seriesId(i);
      last = i;
      // The band goes on only from a series the club won.
      if (!won(i, c.f)) break;
    }
    if (champion === c.f && last === finalIdx && last >= 0) {
      const id = `w${c.f}`;
      links.push({ id, kind: "title", source: seriesId(last), target: CHAMPION, f: c.f, series: last });
      routeLinks.push(id);
      routeNodes.push(CHAMPION);
    }
    routes.push({ f: c.f, nodes: routeNodes, links: routeLinks });
  }
  return { nodes, links, routes, columns: rounds + (champion != null ? 3 : 2), champion, played };
}

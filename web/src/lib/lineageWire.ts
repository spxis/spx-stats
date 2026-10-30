import type { Franchise } from "./lineage.ts";
import { shorten, widen } from "./coachWire.ts";

/** One league's franchises, with the number of franchises the archive has no season for (left out of the diagram). */
export interface LineageLeague {
  franchises: Franchise[];
  omitted: number;
}

/**
 * A league's franchises as they travel from the kept JSON route (/teams/lineage/rows/nhl) to the chart: each is [franchise, page, 1 while it plays, first season, last
 * season, seasons, titles, stretches] and a stretch [name, from, to, seasons, titles, wins, losses, ties, overtime losses].
 */
export type LineageWire = { o: number; f: [number, string, 0 | 1, number, number, number, number, [string, number, number, number, number, number, number, number, number][]][] };

export function packLineage(lg: string, d: LineageLeague): LineageWire {
  const team = `/${lg}/team/`;
  return {
    o: d.omitted,
    f: d.franchises.map((x) => [x.f, shorten(team, x.href), x.active ? 1 : 0, x.first, x.last, x.seasons, x.titles, x.stretches.map((s) => [s.name, s.from, s.to, s.seasons, s.titles, s.w, s.l, s.t, s.otl])]),
  };
}

export function unpackLineage(lg: string, w: LineageWire): LineageLeague {
  const team = `/${lg}/team/`;
  return {
    omitted: w.o,
    franchises: w.f.map(([f, href, active, first, last, seasons, titles, stretches]) => ({
      league: lg, f, href: widen(team, href), active: active === 1, first, last, seasons, titles,
      stretches: stretches.map(([name, from, to, n, t, wins, losses, ties, otl]) => ({ name, from, to, seasons: n, titles: t, w: wins, l: losses, t: ties, otl })),
    })),
  };
}

export const lineageRowsPath = (lg: string): string => `/teams/lineage/rows/${lg}`;

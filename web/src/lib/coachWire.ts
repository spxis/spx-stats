import type { Career, Stint } from "./coachMoves.ts";

/** One league's head coach moves: everything the page needs to draw any decade of it, so the choice can be made in the browser. */
export interface CoachLeague {
  /** Club names (stints point into this table by index). */
  names: string[];
  /** Each franchise that appears: its page and its colour. */
  clubs: Record<number, { href: string; tone: string }>;
  careers: Career[];
}

/**
 * A league's coach moves as they travel from the kept JSON route (/teams/coaches/rows/nhl) to the chart: addresses lose the part every one of them shares, and a stint is a short
 * list of numbers [franchise, first season, last season, seasons held, name, wins, losses, ties, overtime losses, seasons he was the only head coach].
 */
export type CoachWire = {
  n: string[];
  /** [franchise, address of its page, colour]. */
  c: [number, string, string][];
  /** [person id, name, address of his page or null, stints]. */
  k: [number, string, string | null, number[][]][];
};

/** An address with the part it shares with its neighbours cut off; one that does not start with it is kept whole (it starts with a slash, so it can be told). */
export const shorten = (prefix: string, href: string): string => (href.startsWith(prefix) ? href.slice(prefix.length) : href);
export const widen = (prefix: string, href: string): string => (href.startsWith("/") ? href : prefix + href);

export function packCoach(lg: string, d: CoachLeague): CoachWire {
  const team = `/${lg}/team/`, player = `/${lg}/player/`;
  return {
    n: d.names,
    c: Object.entries(d.clubs).map(([f, c]) => [Number(f), shorten(team, c.href), c.tone]),
    k: d.careers.map((c) => [c.id, c.name, c.href == null ? null : shorten(player, c.href), c.stints.map((s) => [s.f, s.a, s.b, s.n, s.s, s.rec.w, s.rec.l, s.rec.t, s.rec.otl, s.sole])]),
  };
}

export function unpackCoach(lg: string, w: CoachWire): CoachLeague {
  const team = `/${lg}/team/`, player = `/${lg}/player/`;
  return {
    names: w.n,
    clubs: Object.fromEntries(w.c.map(([f, href, tone]) => [f, { href: widen(team, href), tone }])),
    careers: w.k.map(([id, name, href, stints]) => ({
      id, name, href: href == null ? null : widen(player, href),
      stints: stints.map((s): Stint => ({ f: s[0], a: s[1], b: s[2], n: s[3], s: s[4], rec: { w: s[5], l: s[6], t: s[7], otl: s[8] }, sole: s[9] })),
    })),
  };
}

export const coachRowsPath = (lg: string): string => `/teams/coaches/rows/${lg}`;

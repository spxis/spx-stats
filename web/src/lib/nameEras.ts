/**
 * A franchise's names over time (the "Names over time" table of a team page): for each name, the seasons the club played under it
 * and the logo it wore. Pure; the page passes in the club's season years and its brand eras.
 */
import { logoFor, type BrandMap } from "./brand.ts";

/** A name and the days it applied: `from` is the first day, `to` the first day after (null: still the name). Either may be a bare year. */
export interface NameSpan { name: string; from: string | null; to: string | null }

export interface NameEra extends NameSpan {
  /** The club's seasons played under this name. */
  seasons: number;
  /** The logo of this name's years, else the club's current logo (`current`), else null. */
  logo: string | null;
  /** The logo is the club's current one standing in because we hold none for these years. */
  current: boolean;
}

/** A date to the form that compares as text: a bare year is its first day, anything longer keeps its first ten characters. */
export const dayOf = (d: string | null | undefined): string | null => {
  if (!d) return null;
  return /^\d{4}$/.test(d) ? `${d}-01-01` : d.slice(0, 10);
};

/** Spans of one name that touch or overlap become one, oldest first: a club that two leagues (or a split identity) list twice shows each name once. */
export function mergeSpans<T extends NameSpan>(spans: readonly T[]): T[] {
  const sorted = [...spans].sort((a, b) => (dayOf(a.from) ?? "").localeCompare(dayOf(b.from) ?? "") || (dayOf(a.to) ?? "9999").localeCompare(dayOf(b.to) ?? "9999"));
  const out: T[] = [];
  for (const s of sorted) {
    const last = out.at(-1);
    if (last && last.name === s.name && (last.to == null || (dayOf(s.from) ?? "") <= dayOf(last.to)!)) {
      const to = last.to == null || s.to == null ? null : dayOf(s.to)! > dayOf(last.to)! ? s.to : last.to;
      out[out.length - 1] = { ...last, to };
    } else out.push(s);
  }
  return out;
}

/**
 * Whether a season belongs to a name. A season is dated by the day its play is under way (the end of September: every league here
 * is playing by then, and the clubs rename in the off-season), which is then compared with the name's days, so a name that began
 * in June 1997 owns the 1997 season and one that ended on 1 January 2022 does not own 2022.
 */
export function seasonUnder(span: { from: string | null; to: string | null }, year: number): boolean {
  const day = `${String(year).padStart(4, "0")}-09-30`, from = dayOf(span.from), to = dayOf(span.to);
  return (from == null || from <= day) && (to == null || day < to);
}

/** The logo that stands for a name: the one worn in most of its seasons (the latest wins a tie); none when no season of it has a logo. */
export function eraLogo(brands: BrandMap, f: number, years: readonly number[]): string | null {
  const count = new Map<string, { n: number; last: number }>();
  for (const y of years) {
    const url = logoFor(brands, f, y);
    if (!url) continue;
    const c = count.get(url) ?? { n: 0, last: 0 };
    count.set(url, { n: c.n + 1, last: Math.max(c.last, y) });
  }
  let best: string | null = null, top: { n: number; last: number } | null = null;
  for (const [url, c] of count) if (!top || c.n > top.n || (c.n === top.n && c.last > top.last)) { best = url; top = c; }
  return best;
}

/**
 * Each name with its season count and logo. `years` are the club's seasons (those the standings table lists). A name no season falls in
 * (a short-lived name, or one with no results on file) counts 0 and takes the logo of the years its dates cover.
 */
export function nameEras(names: readonly NameSpan[], years: readonly number[], brands: BrandMap, f: number): NameEra[] {
  const current = logoFor(brands, f);
  return names.map((n) => {
    const mine = years.filter((y) => seasonUnder(n, y));
    let span = mine;
    if (!span.length) {
      const a = Number(dayOf(n.from)?.slice(0, 4) ?? NaN), b = Number(dayOf(n.to)?.slice(0, 4) ?? NaN);
      if (Number.isFinite(a) && Number.isFinite(b) && b > a) span = Array.from({ length: Math.min(b - a, 200) }, (_, i) => a + i);
    }
    const own = eraLogo(brands, f, span);
    return { ...n, seasons: mine.length, logo: own ?? current, current: own == null && current != null };
  });
}

/**
 * The year range of the players and teams lists (`?from=&to=`): the list keeps what was active in any season from..to, that is, whose first..last season
 * overlaps it. Pure and import-free, so the API, the pages and a node script share it. The strict reader is the API's (a bad value names its parameter);
 * the pages read the same text leniently through parseRange in yearRange.ts.
 */

export const RANGE_MIN_YEAR = 1800;
export const RANGE_MAX_YEAR = 2100;

export interface RangeProblem { param: "from" | "to"; message: string }
export type RangeRead = { ok: true; from: number | undefined; to: number | undefined } | { ok: false; problem: RangeProblem };

const WORDS = `a whole year from ${RANGE_MIN_YEAR} to ${RANGE_MAX_YEAR}`;

/** One year as the caller typed it: digits only (no sign, decimal point or exponent) and inside the allowed years; blank is no value. */
export function readYear(param: "from" | "to", raw: string | undefined): { year: number | undefined } | { problem: RangeProblem } {
  if (raw === undefined || raw === "") return { year: undefined };
  const n = /^\d{1,4}$/.test(raw) ? Number(raw) : NaN;
  if (!(n >= RANGE_MIN_YEAR && n <= RANGE_MAX_YEAR)) return { problem: { param, message: WORDS } };
  return { year: n };
}

/** `from` and `to` together: each a year, and from not after to. One end alone leaves the other open. */
export function readRange(rawFrom: string | undefined, rawTo: string | undefined): RangeRead {
  const f = readYear("from", rawFrom);
  if ("problem" in f) return { ok: false, problem: f.problem };
  const t = readYear("to", rawTo);
  if ("problem" in t) return { ok: false, problem: t.problem };
  if (f.year !== undefined && t.year !== undefined && f.year > t.year) return { ok: false, problem: { param: "from", message: "must not be after to" } };
  return { ok: true, from: f.year, to: t.year };
}

/** The PostgREST filters that keep the rows whose first_season..last_season overlaps from..to (an open end filters nothing). Rows with no seasons drop out. */
export function overlapFilters(from: number | undefined, to: number | undefined): string[] {
  return [to === undefined ? "" : `first_season=lte.${to}`, from === undefined ? "" : `last_season=gte.${from}`].filter(Boolean);
}

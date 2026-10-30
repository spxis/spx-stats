// The SQL of the /quality read in Turso, kept free of imports so a test can run it on a plain SQLite.

/** How many of the most frequent issue lines /quality draws. */
export const QUALITY_ISSUES_SHOWN = 60;

/**
 * SQLite spelling of `text.replace(/\d+/g, "#")`: every digit becomes an unused marker character, runs of markers collapse to one (each pass halves
 * a run, so eight passes handle runs up to 256 digits) and the marker becomes "#". Exact for any text, including one that already holds "#".
 */
export function hashDigitsSql(column: string): string {
  let e = column;
  for (let d = 0; d <= 9; d++) e = `replace(${e}, '${d}', char(1))`;
  for (let i = 0; i < 8; i++) e = `replace(${e}, char(1) || char(1), char(1))`;
  return `replace(${e}, char(1), '#')`;
}

/**
 * api_quality holds one row per distinct issue text and resolution (6,436 rows on 2026-10-29: 2.9 MB as one answer, over the 2 MB Next's data
 * cache will keep, so every build worker and every regeneration read it again), but /quality draws only the 34 check lines and the most frequent
 * issues. The grouping and the ranking are done by Turso: the check lines (a few dozen rows) and the QUALITY_ISSUES_SHOWN most frequent issue
 * lines, grouped by source, kind, text and digit-free resolution as the page groups them. Both answers stay a few KB however the table grows.
 */
export const QUALITY_CHECKS_SQL = "select 'check' as kind, source, entity, what, '' as resolution, sum(n) as n from api_quality where kind = 'check' group by source, entity, what";
export const QUALITY_ISSUES_SQL =
  `select 'issue' as kind, source, entity, what, ${hashDigitsSql("resolution")} as resolution, sum(n) as n from api_quality where kind = 'issue' ` +
  `group by source, entity, what, ${hashDigitsSql("resolution")} order by n desc, source, entity, what, resolution limit ${QUALITY_ISSUES_SHOWN}`;
